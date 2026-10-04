const crypto = require("crypto");

const Reservation = require("../models/Reservation");
const Restaurant = require("../models/Restaurant");
const Table = require("../models/Table");
const User = require("../models/User");

const { AppError } = require("../utils/errors");
const { notify } = require("./notification.service");
const {
  normalizeDate,
  today,
  timeToMinutes,
  minutesToTime,
} = require("../utils/time");
const {
  generateTimeSlots,
  freeTablesForSlot,
  blockingReservations,
  seatingDuration,
} = require("../utils/availability");

/** Booking reference shown on "Reservation Confirmed" (spec §5). */
async function generateBookingId() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = `RES-${crypto.randomInt(1000, 10000)}`;
    // eslint-disable-next-line no-await-in-loop
    const existing = await Reservation.findOne({ bookingId: candidate });
    if (!existing) return candidate;
  }
  throw new AppError("Unable to create a booking reference.", 500, "booking_id_failed");
}

/** Load the restaurant and throw a clean 404 when missing. */
async function getRestaurantOrThrow(restaurantId) {
  const restaurant = await Restaurant.findById(restaurantId).lean();
  if (!restaurant) {
    throw new AppError("Restaurant not found.", 404, "not_found");
  }
  return restaurant;
}

/** Reservations still holding tables for a date. */
async function loadBlockingReservations(restaurantId, date) {
  const reservations = await Reservation.find({
    restaurantId,
    date,
    status: { $in: ["confirmed", "checked-in"] },
  }).lean();
  return blockingReservations(reservations);
}

/**
 * Resolve a free table for a slot, or explain what is available instead.
 *
 * Spec §7: "if a slot becomes unavailable, offer other times" — the thrown
 * AppError carries `details.alternatives` so the UI can show them inline.
 */
async function resolveTable({ restaurant, date, time, partySize }) {
  const startMinutes = timeToMinutes(time);
  if (startMinutes === null) {
    throw new AppError("Please choose a valid time.", 400, "validation_error");
  }

  const [tables, conflicts] = await Promise.all([
    Table.find({ restaurantId: restaurant._id, isActive: true }).lean(),
    loadBlockingReservations(restaurant._id, date),
  ]);

  const free = freeTablesForSlot({
    tables,
    partySize,
    startMinutes,
    conflicts,
    durationMinutes: seatingDuration(restaurant),
  });

  if (free.length > 0) {
    return { table: free[0], tables, conflicts, alternatives: [] };
  }

  // Nothing free for that party size — offer the nearest working slots.
  const slots = generateTimeSlots({
    tables,
    reservations: conflicts.map((entry) => ({
      tableId: entry.tableId,
      time: minutesToTime(entry.start),
      endTime: minutesToTime(entry.end),
      status: entry.status,
    })),
    openingTime: restaurant.openingTime,
    closingTime: restaurant.closingTime,
    intervalMinutes: restaurant.slotIntervalMinutes,
    averageSeatingMinutes: seatingDuration(restaurant),
    partySize,
    date,
  });

  const alternatives = slots
    .filter((slot) => slot.available)
    .slice(0, 4)
    .map((slot) => ({ time: slot.time, label: slot.timeLabel }));

  throw new AppError(
    alternatives.length
      ? "That time has just been taken. Please pick another slot."
      : "No tables are available for that date and party size.",
    409,
    "slot_unavailable",
    { alternatives },
  );
}

/**
 * POST /api/reservations — create a booking (FR02).
 * Completes the "review → confirm" steps client-side; this endpoint is
 * the single confirmation call.
 */
async function createReservation(userId, payload) {
  const restaurant = await getRestaurantOrThrow(payload.restaurantId);

  const date = normalizeDate(payload.date) || today();
  const time = String(payload.time || "").trim();
  const partySize = Number(payload.partySize) || 0;

  if (partySize < 1 || partySize > 20) {
    throw new AppError(
      "Party size must be between 1 and 20 guests.",
      400,
      "validation_error",
    );
  }

  const now = new Date();
  if (date.getTime() < today().getTime()) {
    throw new AppError("Bookings cannot be made in the past.", 400, "validation_error");
  }

  const user = await User.findById(userId);
  const { table } = await resolveTable({ restaurant, date, time, partySize });

  const startMinutes = timeToMinutes(time);
  const endTime = minutesToTime(startMinutes + seatingDuration(restaurant));

  const bookingId = await generateBookingId();

  const reservation = await Reservation.create({
    bookingId,
    userId,
    restaurantId: restaurant._id,
    tableId: table._id,
    partySize,
    date,
    time,
    endTime,
    status: "confirmed",
    guestName: payload.guestName || user?.name || "",
    guestPhone: payload.guestPhone || user?.phone || "",
    specialRequest: payload.specialRequest || "",
    notes: payload.notes || "",
  });

  await notify({
    userId,
    type: "reservation",
    title: "Reservation confirmed",
    body: `Your table at ${restaurant.name} is booked for ${time} on ${date.toISOString().slice(0, 10)}.`,
    route: `/bookings/${reservation.bookingId}`,
    data: { bookingId: reservation.bookingId },
    channel: "push",
  });

  // Keep the floor plan honest (FR08 staff grid).
  await Table.findByIdAndUpdate(table._id, {
    status: "reserved",
    statusChangedAt: now,
  });

  // Populate the table so the confirmation screen can show "Table T04".
  const populated = await Reservation.findById(reservation._id)
    .populate("restaurantId", "name cuisine images address city rating")
    .populate("tableId", "tableNumber capacity")
    .lean();

  return {
    message: "Your table is booked.",
    data: { reservation: shapeForCustomer(populated) },
  };
}

/** Upcoming/past split used by My Bookings (spec §5). */
async function listMine(userId, options = {}) {
  const filter = { userId };
  if (options.status) filter.status = options.status;

  const now = new Date();
  const reservations = await Reservation.find(filter)
    .sort({ date: -1, time: -1 })
    .populate("restaurantId", "name cuisine images address city rating")
    .populate("tableId", "tableNumber capacity")
    .lean();

  const upcoming = reservations
    .filter((entry) => isUpcoming(entry, now))
    .sort(sortAscending);
  const past = reservations
    .filter((entry) => !isUpcoming(entry, now))
    .sort((a, b) => b.date - a.date);

  return {
    data: {
      upcoming: upcoming.map(shapeForCustomer),
      past: past.map(shapeForCustomer),
      all: reservations.map(shapeForCustomer),
    },
    lastUpdated: now.toISOString(),
  };
}

function isUpcoming(entry, now) {
  if (["cancelled", "no-show", "completed"].includes(entry.status)) return false;
  const start = new Date(entry.date);
  const [hours, minutes] = String(entry.time).split(":").map(Number);
  start.setUTCHours(hours || 0, minutes || 0, 0, 0);
  return start.getTime() >= now.getTime() - 60 * 60 * 1000;
}

function sortAscending(a, b) {
  return new Date(a.date) - new Date(b.date);
}

function shapeForCustomer(entry) {
  const restaurant = entry.restaurantId;
  return {
    id: entry._id,
    bookingId: entry.bookingId,
    status: entry.status,
    partySize: entry.partySize,
    date: entry.date,
    time: entry.time,
    endTime: entry.endTime,
    specialRequest: entry.specialRequest,
    guestName: entry.guestName,
    tableNumber: entry.tableId?.tableNumber || "",
    tableCapacity: entry.tableId?.capacity || null,
    restaurant: restaurant
      ? {
          id: restaurant._id,
          name: restaurant.name,
          cuisine: restaurant.cuisine,
          image: restaurant.images?.[0] || "",
          address: restaurant.address,
          city: restaurant.city,
          rating: restaurant.rating,
        }
      : null,
    createdAt: entry.createdAt,
    checkedInAt: entry.checkedInAt,
    cancelledAt: entry.cancelledAt,
  };
}

/** GET /api/reservations/:id — single booking (detail / change screens). */
async function getReservationById(id, requestingUser) {
  const reservation = await Reservation.findById(id)
    .populate("restaurantId")
    .populate("tableId")
    .lean();

  if (!reservation) {
    throw new AppError("Reservation not found.", 404, "not_found");
  }

  // Customers may only read their own booking (NFR04).
  const isOwner = String(reservation.userId) === String(requestingUser._id);
  const isStaff = ["staff", "manager"].includes(requestingUser.role);
  if (!isOwner && !isStaff) {
    throw new AppError("You do not have permission to view this booking.", 403, "forbidden");
  }

  const shaped = shapeForCustomer(reservation);
  return {
    data: {
      ...shaped,
      reservation: shaped,
    },
  };
}

/**
 * PUT /api/reservations/:id — modify a reservation (FR07).
 * Re-runs conflict + slot-availability checks; when the new slot is gone it
 * responds 409 with alternatives so the UI can offer other times (spec §7).
 */
async function updateReservation(id, requestingUser, payload) {
  const reservation = await Reservation.findById(id);
  if (!reservation) {
    throw new AppError("Reservation not found.", 404, "not_found");
  }

  const isOwner = String(reservation.userId) === String(requestingUser._id);
  if (!isOwner && !["staff", "manager"].includes(requestingUser.role)) {
    throw new AppError("You do not have permission to change this booking.", 403, "forbidden");
  }

  if (["cancelled", "completed", "no-show"].includes(reservation.status)) {
    throw new AppError(
      "This booking can no longer be changed.",
      409,
      "reservation_closed",
    );
  }

  const restaurant = await getRestaurantOrThrow(reservation.restaurantId);

  const date = payload.date ? normalizeDate(payload.date) : reservation.date;
  const time = payload.time || reservation.time;
  const partySize = Number(payload.partySize) || reservation.partySize;

  if (partySize < 1 || partySize > 20) {
    throw new AppError(
      "Party size must be between 1 and 20 guests.",
      400,
      "validation_error",
    );
  }

  // Free the current table before re-checking, so self-changes never clash.
  const conflicts = (await loadBlockingReservations(restaurant._id, date)).filter(
    (entry) => String(entry.tableId) !== String(reservation.tableId),
  );
  const tables = await Table.find({
    restaurantId: restaurant._id,
    isActive: true,
  }).lean();

  const startMinutes = timeToMinutes(time);
  const free = freeTablesForSlot({
    tables,
    partySize,
    startMinutes,
    conflicts,
    durationMinutes: seatingDuration(restaurant),
  });

  if (free.length === 0) {
    const slots = generateTimeSlots({
      tables,
      reservations: conflicts.map((entry) => ({
        tableId: entry.tableId,
        time: minutesToTime(entry.start),
        endTime: minutesToTime(entry.end),
        status: entry.status,
      })),
      openingTime: restaurant.openingTime,
      closingTime: restaurant.closingTime,
      intervalMinutes: restaurant.slotIntervalMinutes,
      averageSeatingMinutes: seatingDuration(restaurant),
      partySize,
      date,
    });

    throw new AppError(
      "That time is no longer available. Your existing booking stays safe until you save.",
      409,
      "slot_unavailable",
      {
        alternatives: slots
          .filter((slot) => slot.available)
          .slice(0, 4)
          .map((slot) => ({ time: slot.time, label: slot.timeLabel })),
      },
    );
  }

  reservation.date = date;
  reservation.time = time;
  reservation.partySize = partySize;
  reservation.tableId = free[0]._id;
  reservation.endTime = minutesToTime(startMinutes + seatingDuration(restaurant));
  if (payload.specialRequest !== undefined) {
    reservation.specialRequest = payload.specialRequest;
  }
  await reservation.save();

  const updated = await Reservation.findById(id)
    .populate("restaurantId", "name cuisine images address city rating")
    .populate("tableId", "tableNumber capacity")
    .lean();

  await notify({
    userId: reservation.userId,
    type: "reservation",
    title: "Reservation updated",
    body: `Your booking is now ${time} for ${partySize} at ${restaurant.name}.`,
    route: `/bookings/${reservation.bookingId}`,
    channel: "push",
  });

  return {
    message: "Your booking has been updated.",
    data: { reservation: shapeForCustomer(updated) },
  };
}

/**
 * DELETE /api/reservations/:id — cancel (FR07).
 * The confirmation dialog lives in the app; the API just performs it.
 */
async function cancelReservation(id, requestingUser, reason = "") {
  const reservation = await Reservation.findById(id);
  if (!reservation) {
    throw new AppError("Reservation not found.", 404, "not_found");
  }

  const isOwner = String(reservation.userId) === String(requestingUser._id);
  if (!isOwner && !["staff", "manager"].includes(requestingUser.role)) {
    throw new AppError("You do not have permission to cancel this booking.", 403, "forbidden");
  }

  if (["cancelled", "completed", "no-show"].includes(reservation.status)) {
    throw new AppError("This booking is already closed.", 409, "reservation_closed");
  }

  reservation.status = "cancelled";
  reservation.cancelledAt = new Date();
  reservation.cancellationReason = reason || "";
  await reservation.save();

  // Release the floor plan slot again (FR08).
  await Table.findOneAndUpdate(
    { _id: reservation.tableId, status: "reserved" },
    { status: "available", statusChangedAt: new Date() },
  );

  await notify({
    userId: reservation.userId,
    type: "reservation",
    title: "Reservation cancelled",
    body: "Your booking has been cancelled. We hope to see you soon.",
    route: "/bookings",
    channel: "push",
  });

  return {
    message: "Reservation cancelled.",
    data: { reservation: { id: reservation._id, bookingId: reservation.bookingId, status: reservation.status } },
  };
}

/**
 * Staff view: today's reservations with search + check-in (FR09).
 */
async function listForStaff({ restaurantId, date, q = "", status = "" }) {
  const bookingDate = normalizeDate(date) || today();
  const filter = { restaurantId, date: bookingDate };

  if (status) filter.status = status;

  let reservations = await Reservation.find(filter)
    .sort({ time: 1 })
    .populate("userId", "name phone email")
    .populate("tableId", "tableNumber capacity")
    .lean();

  if (q) {
    const needle = q.toLowerCase();
    reservations = reservations.filter((entry) => {
      const haystack = [
        entry.bookingId,
        entry.guestName,
        entry.userId?.name,
        entry.userId?.phone,
        entry.tableId?.tableNumber,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }

  return {
    data: reservations.map((entry) => ({
      ...shapeForCustomer(entry),
      guest: entry.userId
        ? { name: entry.userId.name, phone: entry.userId.phone, email: entry.userId.email }
        : { name: entry.guestName, phone: entry.guestPhone, email: "" },
    })),
    date: bookingDate,
    total: reservations.length,
    lastUpdated: new Date().toISOString(),
  };
}

/** FR09 — staff check-in. Marks the party arrived. */
async function checkIn(id, restaurantId) {
  const reservation = await Reservation.findById(id);
  if (!reservation) {
    throw new AppError("Reservation not found.", 404, "not_found");
  }
  if (restaurantId && String(reservation.restaurantId) !== String(restaurantId)) {
    throw new AppError("Reservation belongs to another restaurant.", 403, "forbidden");
  }
  if (["cancelled", "no-show"].includes(reservation.status)) {
    throw new AppError("This booking cannot be checked in.", 409, "reservation_closed");
  }

  reservation.status = "checked-in";
  reservation.checkedInAt = new Date();
  await reservation.save();

  await Table.findByIdAndUpdate(reservation.tableId, {
    status: "occupied",
    statusChangedAt: new Date(),
  });

  return {
    message: "Guest checked in.",
    data: { reservation: { id: reservation._id, bookingId: reservation.bookingId, status: reservation.status } },
  };
}

/** FR09 — staff mark a no-show. */
async function markNoShow(id, restaurantId) {
  const reservation = await Reservation.findById(id);
  if (!reservation) {
    throw new AppError("Reservation not found.", 404, "not_found");
  }
  if (restaurantId && String(reservation.restaurantId) !== String(restaurantId)) {
    throw new AppError("Reservation belongs to another restaurant.", 403, "forbidden");
  }

  reservation.status = "no-show";
  await reservation.save();

  await Table.findOneAndUpdate(
    { _id: reservation.tableId, status: "reserved" },
    { status: "available", statusChangedAt: new Date() },
  );

  return {
    message: "Marked as no-show.",
    data: { reservation: { id: reservation._id, bookingId: reservation.bookingId, status: reservation.status } },
  };
}

module.exports = {
  createReservation,
  listMine,
  getReservationById,
  updateReservation,
  cancelReservation,
  listForStaff,
  checkIn,
  markNoShow,
  resolveTable,
  shapeForCustomer,
};
