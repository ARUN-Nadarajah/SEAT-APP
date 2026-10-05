const Restaurant = require("../models/Restaurant");
const Table = require("../models/Table");
const Reservation = require("../models/Reservation");
const QueueEntry = require("../models/QueueEntry");

const { AppError } = require("../utils/errors");
const {
  normalizeDate,
  today,
  timeToMinutes,
  formatTime,
} = require("../utils/time");
const {
  generateTimeSlots,
  firstAvailableSlot,
  walkInWait,
  seatingDuration,
} = require("../utils/availability");

/** Parties currently waiting in this restaurant's live queue. */
async function countQueue(restaurantId) {
  return QueueEntry.countDocuments({
    restaurantId,
    status: { $in: ["waiting", "notified"] },
  });
}

/** Tables that still hold a confirmed booking for this date. */
async function loadDateContext(restaurantId, date) {
  const [tables, reservations, queueLength] = await Promise.all([
    Table.find({ restaurantId, isActive: true }).lean(),
    Reservation.find({
      restaurantId,
      date,
      status: { $in: ["confirmed", "checked-in", "cancellation_pending"] },
    }).lean(),
    countQueue(restaurantId),
  ]);

  return { tables, reservations, queueLength };
}

/**
 * Availability summary for one restaurant — powers FR01:
 * "Tonight from 7:00 PM", "15–25 min walk-in wait", available table count.
 */
async function buildAvailability(restaurant, date, partySize = 2) {
  const { tables, reservations, queueLength } = await loadDateContext(
    restaurant._id,
    date,
  );

  const slots = generateTimeSlots({
    tables,
    reservations,
    openingTime: restaurant.openingTime,
    closingTime: restaurant.closingTime,
    intervalMinutes: restaurant.slotIntervalMinutes,
    averageSeatingMinutes: seatingDuration(restaurant),
    partySize,
    date,
  });

  const firstSlot = firstAvailableSlot(slots);
  const freeTablesNow = slots.reduce(
    (max, slot) => Math.max(max, slot.availableTables),
    0,
  );

  const wait = walkInWait({
    queueLength,
    averageSeatingMinutes: seatingDuration(restaurant),
    freeTables: Math.max(1, Math.round(tables.length / 4)),
  });

  const availableCount = slots.filter((slot) => slot.available).length;

  return {
    totalTables: tables.length,
    availableTables: freeTablesNow,
    availableSlots: availableCount,
    isFullyBooked: availableCount === 0,
    queueLength,
    firstSlot: firstSlot ? { time: firstSlot.time, label: firstSlot.timeLabel } : null,
    firstSlotLabel: firstSlot ? firstSlot.timeLabel : formatTime(restaurant.openingTime),
    walkInWait: { ...wait, label: `${wait.min}–${wait.max} min` },
    status:
      availableCount === 0 ? "fully-booked" : availableCount <= 3 ? "limited" : "available",
    lastUpdated: new Date().toISOString(),
  };
}

/** Explore card shape (spec §5 Home/Explore). */
function toCard(restaurant, availability) {
  return {
    id: restaurant._id,
    name: restaurant.name,
    cuisine: restaurant.cuisine,
    description: restaurant.description,
    image: restaurant.images?.[0] || restaurant.image || "",
    images: restaurant.images || [],
    rating: restaurant.rating,
    reviewCount: restaurant.reviewCount,
    priceRange: restaurant.priceRange,
    address: restaurant.address,
    city: restaurant.city,
    distanceMeters: restaurant.distanceMeters,
    openHoursLabel:
      restaurant.openHoursLabel ||
      `Open until ${formatTime(restaurant.closingTime)}`,
    parking: restaurant.parking,
    parkingLabel: restaurant.parkingLabel,
    isQueueEnabled: restaurant.isQueueEnabled,
    firstSlotLabel: `Tonight from ${availability.firstSlotLabel}`,
    walkInWaitLabel: `${availability.walkInWait.min}–${availability.walkInWait.max} min walk-in wait`,
    availableTables: availability.availableTables,
    availabilityStatus: availability.status,
    queueLength: availability.queueLength,
    lastUpdated: availability.lastUpdated,
  };
}

/** Detail payload (spec §5 Restaurant Details). */
function toDetail(restaurant, availability, slots) {
  const location = restaurant.location &&
    Number.isFinite(restaurant.location.lat) &&
    Number.isFinite(restaurant.location.lng)
    ? restaurant.location
    : { lat: 9.6615, lng: 80.0249 };

  return {
    ...toCard(restaurant, availability),
    description: restaurant.description,
    openingTime: restaurant.openingTime,
    closingTime: restaurant.closingTime,
    phone: restaurant.phone,
    location,
    averageSeatingMinutes: restaurant.averageSeatingMinutes,
    availability,
    slots,
  };
}

/**
 * GET /api/restaurants — list with live availability (spec §7 / FR01).
 * Query: ?q= &cuisine= &tonight=1 &partySize= &date= &openNow=1
 */
async function listRestaurants(filters = {}) {
  const {
    q = "",
    cuisine = "",
    tonight = false,
    partySize = 2,
    date = null,
    page = 1,
    limit = 50,
  } = filters;

  const query = { status: "active" };

  if (cuisine) {
    // Comma-separated allow-list, matched case-insensitively.
    const allowed = cuisine
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (allowed.length) {
      query.cuisine = { $in: allowed.map((value) => new RegExp(`^${escapeRegex(value)}$`, "i")) };
    }
  }

  if (q) {
    const pattern = new RegExp(escapeRegex(q.trim()), "i");
    query.$or = [{ name: pattern }, { cuisine: pattern }, { description: pattern }];
  }

  const [restaurants, total] = await Promise.all([
    Restaurant.find(query)
      .sort({ rating: -1, name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Restaurant.countDocuments(query),
  ]);

  const bookingDate = normalizeDate(date) || today();

  const data = await Promise.all(
    restaurants.map(async (restaurant) => {
      const availability = await buildAvailability(
        restaurant,
        bookingDate,
        Number(partySize) || 2,
      );
      return toCard(restaurant, availability);
    }),
  );

  const filtered = tonight
    ? data.filter((card) => card.availabilityStatus !== "fully-booked")
    : data;

  return {
    data: filtered,
    total: filtered.length,
    totalInDb: total,
    date: bookingDate,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * GET /api/restaurants/:id — details + availability + slots (FR02 source).
 */
async function getRestaurantById(id, options = {}) {
  const restaurant = await Restaurant.findById(id).lean();
  if (!restaurant) {
    throw new AppError("Restaurant not found.", 404, "not_found");
  }

  const bookingDate = normalizeDate(options.date) || today();
  const partySize = Number(options.partySize) || 2;

  const availability = await buildAvailability(restaurant, bookingDate, partySize);
  const { tables, reservations } = await loadDateContext(restaurant._id, bookingDate);

  const slots = generateTimeSlots({
    tables,
    reservations,
    openingTime: restaurant.openingTime,
    closingTime: restaurant.closingTime,
    intervalMinutes: restaurant.slotIntervalMinutes,
    averageSeatingMinutes: seatingDuration(restaurant),
    partySize,
    date: bookingDate,
  });

  return {
    data: toDetail(restaurant, availability, slots),
    date: bookingDate,
    lastUpdated: availability.lastUpdated,
  };
}

/** Manager view of the shared restaurant record without availability data. */
async function getRestaurantInfo(id) {
  const restaurant = await Restaurant.findById(id).lean();
  if (!restaurant) {
    throw new AppError("Restaurant not found.", 404, "not_found");
  }
  return {
    data: restaurant,
    lastUpdated: restaurant.updatedAt || new Date().toISOString(),
  };
}

/** Update only manager-editable restaurant information fields. */
async function updateRestaurantInfo(id, input) {
  const restaurant = await Restaurant.findByIdAndUpdate(id, input, {
    new: true,
    runValidators: true,
  }).lean();
  if (!restaurant) {
    throw new AppError("Restaurant not found.", 404, "not_found");
  }
  return {
    data: restaurant,
    lastUpdated: restaurant.updatedAt || new Date().toISOString(),
  };
}

/**
 * GET /api/restaurants/:id/slots — available time slots (spec §7).
 * Also used to offer alternatives when a requested slot disappears (FR07).
 */
async function getAvailableSlots(id, options = {}) {
  const restaurant = await Restaurant.findById(id).lean();
  if (!restaurant) {
    throw new AppError("Restaurant not found.", 404, "not_found");
  }

  const bookingDate = normalizeDate(options.date) || today();
  const partySize = Number(options.partySize) || 2;

  const { tables, reservations } = await loadDateContext(restaurant._id, bookingDate);

  const slots = generateTimeSlots({
    tables,
    reservations,
    openingTime: restaurant.openingTime,
    closingTime: restaurant.closingTime,
    intervalMinutes: restaurant.slotIntervalMinutes,
    averageSeatingMinutes: seatingDuration(restaurant),
    partySize,
    date: bookingDate,
  });

  return {
    data: slots,
    date: bookingDate,
    partySize,
    restaurant: { id: restaurant._id, name: restaurant.name },
    alternatives: slots.filter((slot) => slot.available).slice(0, 4),
    lastUpdated: new Date().toISOString(),
  };
}

/** GET /api/restaurants/:id/menu — "A taste of …" screen. */
async function getMenu(id) {
  const restaurant = await Restaurant.findById(id).lean();
  if (!restaurant) {
    throw new AppError("Restaurant not found.", 404, "not_found");
  }

  const categories = [];
  for (const item of restaurant.menuItems || []) {
    let bucket = categories.find((entry) => entry.name === item.category);
    if (!bucket) {
      bucket = { name: item.category, items: [] };
      categories.push(bucket);
    }
    bucket.items.push(item);
  }

  return {
    data: {
      restaurant: { id: restaurant._id, name: restaurant.name },
      categories,
      items: restaurant.menuItems || [],
    },
    lastUpdated: new Date().toISOString(),
  };
}

/** GET /api/restaurants/search — lightweight "Close to you" results. */
async function searchRestaurants(term, options = {}) {
  const result = await listRestaurants({ ...options, q: term });
  return { ...result, query: term };
}

/** Staff/manager creation helper used by the seed script and admin routes. */
async function createRestaurant(payload) {
  return Restaurant.create(payload);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Time slot list for a specific date used by the change-reservation flow. */
function slotsForDate(tables, reservations, restaurant, date, partySize) {
  return generateTimeSlots({
    tables,
    reservations,
    openingTime: restaurant.openingTime,
    closingTime: restaurant.closingTime,
    intervalMinutes: restaurant.slotIntervalMinutes,
    averageSeatingMinutes: seatingDuration(restaurant),
    partySize,
    date,
  });
}

module.exports = {
  listRestaurants,
  getRestaurantById,
  getRestaurantInfo,
  updateRestaurantInfo,
  getAvailableSlots,
  getMenu,
  searchRestaurants,
  createRestaurant,
  buildAvailability,
  loadDateContext,
  slotsForDate,
  toCard,
  timeToMinutes,
};
