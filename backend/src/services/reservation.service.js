const crypto = require("crypto");

const Reservation = require("../models/Reservation");
const Restaurant = require("../models/Restaurant");
const Table = require("../models/Table");
const User = require("../models/User");
const Order = require("../models/Order");
const Food = require("../models/Food");

const { AppError } = require("../utils/errors");
const { notify, notifyRestaurantStaff } = require("./notification.service");
const { notifyEligibleOffers } = require("./offer.service");
const receiptService = require("./receipt.service");
const {
  normalizeDate,
  today,
  timeToMinutes,
  minutesToTime,
  validateReservationTimeRange,
  validateReservationDate,
  combineDateAndTime,
} = require("../utils/time");
const {
  generateTimeSlots,
  freeTablesForSlot,
  blockingReservations,
  hasReservationConflict,
  seatingDuration,
  tableFits,
} = require("../utils/availability");

/** In-memory lock per table + date to ensure atomic conflict check & booking creation. */
const bookingLocks = new Map();
async function acquireLock(key) {
  while (bookingLocks.has(key)) {
    // eslint-disable-next-line no-await-in-loop
    await bookingLocks.get(key);
  }
  let unlock;
  const promise = new Promise((resolve) => {
    unlock = resolve;
  });
  bookingLocks.set(key, promise);
  return () => {
    bookingLocks.delete(key);
    unlock();
  };
}

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

/** Reservations still holding tables for a date (including pending cancellation). */
async function loadBlockingReservations(restaurantId, date) {
  const reservations = await Reservation.find({
    restaurantId,
    date,
    status: { $in: ["confirmed", "checked-in", "cancellation_pending"] },
  }).lean();
  return blockingReservations(reservations);
}

/**
 * Resolve a free table for a slot, or explain what is available instead.
 * Validates time range, capacity, and buffer conflict.
 */
async function resolveTable({ restaurant, date, startTime, endTime, partySize, tableId }) {
  const { startMinutes, endMinutes, durationMinutes, durationHours } =
    validateReservationTimeRange(startTime, endTime);

  const [tables, conflicts] = await Promise.all([
    Table.find({ restaurantId: restaurant._id, isActive: true }).lean(),
    loadBlockingReservations(restaurant._id, date),
  ]);

  if (tableId) {
    const selected = tables.find((t) => String(t._id) === String(tableId));
    if (!selected) {
      throw new AppError("Selected table not found.", 404, "not_found");
    }
    if (selected.status === "maintenance") {
      throw new AppError("Selected table is currently unavailable.", 400, "validation_error");
    }
    if (selected.capacity < partySize) {
      throw new AppError(
        `Selected table ${selected.tableNumber} can seat at most ${selected.capacity} guests.`,
        400,
        "validation_error",
      );
    }

    const hasConflict = hasReservationConflict({
      tableId: selected._id,
      startMinutes,
      endMinutes,
      conflicts,
    });

    if (hasConflict) {
      throw new AppError(
        `Selected table ${selected.tableNumber} is not available at that time.`,
        409,
        "slot_unavailable",
      );
    }

    const hourlyRate =
      selected.hourlyReservationRate !== undefined ? selected.hourlyReservationRate : 300;
    const reservationFee = Math.round(hourlyRate * durationHours);

    return {
      table: selected,
      hourlyRate,
      reservationFee,
      durationMinutes,
      durationHours,
      tables,
      conflicts,
      alternatives: [],
    };
  }

  // Automatic table resolution (for backwards compatibility / legacy tests)
  const fitting = tables.filter((t) => tableFits(t, partySize));
  const freeTable = fitting.find((t) => {
    return !hasReservationConflict({
      tableId: t._id,
      startMinutes,
      endMinutes,
      conflicts,
    });
  });

  if (freeTable) {
    const hourlyRate =
      freeTable.hourlyReservationRate !== undefined ? freeTable.hourlyReservationRate : 300;
    const reservationFee = Math.round(hourlyRate * durationHours);
    return {
      table: freeTable,
      hourlyRate,
      reservationFee,
      durationMinutes,
      durationHours,
      tables,
      conflicts,
      alternatives: [],
    };
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
 * Validates date (within 30 days, not past), operating hours (8:00 AM - 10:00 PM),
 * 30-minute increments, minimum 30 min duration, table capacity, interval conflict + 30m buffer,
 * authoritatively calculates and snapshots reservation fee.
 * Does NOT permanently mark table status as 'reserved' (Section 1).
 */
async function createReservation(userId, payload) {
  const restaurant = await getRestaurantOrThrow(payload.restaurantId);

  const date = validateReservationDate(payload.date);
  const partySize = Number(payload.partySize) || 0;

  if (partySize < 1 || partySize > 20) {
    throw new AppError(
      "Party size must be between 1 and 20 guests.",
      400,
      "validation_error",
    );
  }

  const startTime = String(payload.startTime || payload.time || "").trim();
  const startMinutes = timeToMinutes(startTime);
  if (startMinutes === null) {
    throw new AppError("Please choose a valid time.", 400, "validation_error");
  }

  let endTime = payload.endTime ? String(payload.endTime).trim() : "";
  if (!endTime) {
    const endMin = Math.min(1320, startMinutes + 60);
    endTime = minutesToTime(endMin);
  }

  const { durationMinutes } = validateReservationTimeRange(startTime, endTime);

  // Concurrency safety (Section 21 concurrent booking test case)
  const lockKey = `${payload.tableId || "any"}:${date.toISOString().slice(0, 10)}`;
  const releaseLock = await acquireLock(lockKey);

  let reservation;
  try {
    const user = await User.findById(userId);
    const { table, hourlyRate, reservationFee } = await resolveTable({
      restaurant,
      date,
      startTime,
      endTime,
      partySize,
      tableId: payload.tableId,
    });

    const bookingId = await generateBookingId();
    const startDateTime = combineDateAndTime(date, startTime);
    const endDateTime = combineDateAndTime(date, endTime);

    let preOrderItems = [];
    let preOrderTotal = 0;
    const rawItems = payload.items || payload.preOrderItems;
    if (Array.isArray(rawItems) && rawItems.length > 0) {
      let menuItems = restaurant.menuItems || [];
      if (menuItems.length === 0) {
        menuItems = await Food.find({
          restaurantId: restaurant._id,
          isAvailable: true,
        }).lean();
      }
      preOrderItems = rawItems.map((item) => {
        const qty = Number(item.quantity) || 1;
        const menuItem = menuItems.find(
          (candidate) => String(candidate._id) === String(item.menuItemId || item.id || item._id),
        );
        const name = menuItem ? menuItem.name : (item.name || "Item");
        const price = menuItem ? menuItem.price : (Number(item.price) || 0);
        return {
          menuItemId: menuItem ? menuItem._id : item.menuItemId,
          name,
          price,
          quantity: qty,
          note: String(item.note || "").trim(),
          totalAmount: qty * price,
        };
      });
      preOrderTotal = preOrderItems.reduce((acc, curr) => acc + curr.totalAmount, 0);
    }

    reservation = await Reservation.create({
      bookingId,
      userId,
      restaurantId: restaurant._id,
      tableId: table._id,
      partySize,
      date,
      time: startTime,
      endTime,
      durationMinutes,
      hourlyRate,
      reservationFee,
      startDateTime,
      endDateTime,
      status: "confirmed",
      guestName: payload.guestName || user?.name || "",
      guestPhone: payload.guestPhone || user?.phone || "",
      specialRequest: payload.specialRequest || "",
      notes: payload.notes || "",
      preOrderItems,
      preOrderTotal,
    });

    if (preOrderItems.length > 0) {
      try {
        const orderCode = `ORD-${crypto.randomInt(1000, 10000)}`;
        const order = await Order.create({
          orderCode,
          userId,
          restaurantId: restaurant._id,
          reservationId: reservation._id,
          tableId: table._id,
          items: preOrderItems.map((item) => ({
            menuItemId: item.menuItemId,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            notes: item.note,
            totalAmount: item.totalAmount,
          })),
          totalAmount: preOrderTotal,
          status: "placed",
          orderType: "dine-in",
          notes: payload.preOrderNotes || payload.specialRequest || "",
        });
        reservation.orderId = order._id;
        await reservation.save();
      } catch (orderErr) {
        console.error("[reservation] Failed to create linked pre-order:", orderErr.message);
      }
    }

    await notify({
      userId,
      type: "reservation",
      title: "Reservation confirmed",
      body: `Your table at ${restaurant.name} is booked for ${startTime} on ${date.toISOString().slice(0, 10)}.`,
      route: `/bookings/${reservation.bookingId}`,
      data: { bookingId: reservation.bookingId },
      channel: "push",
    });

    await notifyRestaurantStaff(restaurant._id, {
      type: "reservation",
      title: "New Reservation",
      body: `New booking ${bookingId} for ${partySize} guests at ${startTime}.`,
      route: `/staff/reservations/${reservation._id}`,
      data: { reservationId: String(reservation._id), bookingId },
    });

    // In compliance with E-Receipt system: Generate initial receipt snapshot (v1)
    try {
      await receiptService.generateReceipt(reservation._id);
    } catch (err) {
      console.error("[receipt] Failed to generate initial receipt:", err.message);
    }

    // NOTE: In compliance with Section 1: Do NOT permanently set Table status to 'reserved'!
    // Physical table availability is date + time-range based.
  } finally {
    releaseLock();
  }

  // Populate the table so the confirmation screen can show "Table T04".
  const populated = await Reservation.findById(reservation._id)
    .populate("restaurantId", "name cuisine images address city rating")
    .populate("tableId", "tableNumber capacity hourlyReservationRate")
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
      upcoming: upcoming.map((entry) => shapeForCustomer(entry, now)),
      past: past.map((entry) => shapeForCustomer(entry, now)),
      all: reservations.map((entry) => shapeForCustomer(entry, now)),
    },
    lastUpdated: now.toISOString(),
  };
}

function toValidDate(val) {
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val;
  }
  if (typeof val === "string" || (typeof val === "number" && val > 1_000_000_000)) {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function isUpcoming(entry, now = new Date()) {
  const currentDate = toValidDate(now);
  if (["cancelled", "no-show", "completed"].includes(entry.status)) return false;
  if (entry.endDateTime) {
    return new Date(entry.endDateTime).getTime() >= currentDate.getTime();
  }
  if (entry.startDateTime) {
    return new Date(entry.startDateTime).getTime() >= currentDate.getTime() - 60 * 60 * 1000;
  }
  const dateStr = entry.date instanceof Date
    ? entry.date.toISOString().slice(0, 10)
    : String(entry.date).slice(0, 10);
  const timeStr = entry.endTime || entry.time || "12:00";
  const end = combineDateAndTime(dateStr, timeStr);
  if (end) {
    return end.getTime() >= currentDate.getTime();
  }
  const start = new Date(entry.date);
  const [hours, minutes] = String(entry.time || "00:00").split(":").map(Number);
  start.setUTCHours(hours || 0, minutes || 0, 0, 0);
  return start.getTime() >= currentDate.getTime() - 60 * 60 * 1000;
}

function sortAscending(a, b) {
  return new Date(a.date) - new Date(b.date);
}

function shapeForCustomer(entry, now = new Date()) {
  const currentDate = toValidDate(now);
  const restaurant = entry.restaurantId;
  const table = entry.tableId;
  const hourlyRate =
    entry.hourlyRate !== undefined && entry.hourlyRate !== null
      ? entry.hourlyRate
      : (table?.hourlyReservationRate !== undefined ? table.hourlyReservationRate : 300);
  const durationMinutes = entry.durationMinutes || 60;
  const reservationFee =
    entry.reservationFee !== undefined && entry.reservationFee !== null
      ? entry.reservationFee
      : Math.round(hourlyRate * (durationMinutes / 60));

  const isPast = !isUpcoming(entry, currentDate);
  const canEdit = !isPast && !["cancelled", "completed", "no-show", "cancellation_pending"].includes(entry.status);

  return {
    id: entry._id,
    bookingId: entry.bookingId,
    status: entry.status,
    partySize: entry.partySize,
    date: entry.date,
    time: entry.time,
    startTime: entry.time,
    endTime: entry.endTime,
    durationMinutes,
    hourlyRate,
    reservationFee,
    startDateTime: entry.startDateTime || null,
    endDateTime: entry.endDateTime || null,
    specialRequest: entry.specialRequest,
    guestName: entry.guestName,
    preOrderItems: (entry.preOrderItems || []).map((item) => ({
      menuItemId: item.menuItemId ? String(item.menuItemId) : "",
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      totalAmount: item.totalAmount !== undefined ? item.totalAmount : item.price * item.quantity,
      note: item.note || "",
    })),
    preOrderTotal: entry.preOrderTotal || 0,
    orderId: entry.orderId ? String(entry.orderId) : null,
    isPast,
    canEdit,
    tableId: table?._id ? String(table._id) : (table ? String(table) : ""),
    tableNumber: table?.tableNumber || "",
    tableCapacity: table?.capacity || null,
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
    cancellationRequestedAt: entry.cancellationRequestedAt || null,
    cancellationReason: entry.cancellationReason || "",
    cancellationReviewedBy: entry.cancellationReviewedBy || null,
    cancellationReviewedAt: entry.cancellationReviewedAt || null,
    cancellationReviewComment: entry.cancellationReviewComment || "",
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
 * Re-runs conflict + slot-availability checks excluding this reservation.
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

  if (reservation.status === "cancellation_pending") {
    throw new AppError(
      "Cannot modify a booking while a cancellation request is pending review.",
      409,
      "cancellation_pending",
    );
  }

  const now = new Date();
  if (!isUpcoming(reservation, now) || ["cancelled", "completed", "no-show"].includes(reservation.status)) {
    throw new AppError(
      "Past or closed reservations cannot be changed.",
      400,
      "reservation_closed",
    );
  }

  const restaurant = await getRestaurantOrThrow(reservation.restaurantId);

  const date = payload.date ? validateReservationDate(payload.date) : reservation.date;
  const startTime = String(payload.startTime || payload.time || reservation.time).trim();
  const partySize = Number(payload.partySize) || reservation.partySize;

  if (partySize < 1 || partySize > 20) {
    throw new AppError(
      "Party size must be between 1 and 20 guests.",
      400,
      "validation_error",
    );
  }

  const startMin = timeToMinutes(startTime);
  let endTime = payload.endTime ? String(payload.endTime).trim() : "";
  if (!endTime) {
    if (payload.startTime || payload.time) {
      const prevDuration = reservation.durationMinutes || 60;
      endTime = minutesToTime(Math.min(1320, startMin + prevDuration));
    } else {
      endTime = reservation.endTime;
    }
  }

  const { startMinutes, endMinutes, durationMinutes, durationHours } =
    validateReservationTimeRange(startTime, endTime);

  // Free the current reservation before re-checking so self-changes never clash (Section 17).
  const conflicts = (await loadBlockingReservations(restaurant._id, date)).filter(
    (entry) => String(entry.id) !== String(reservation._id),
  );
  const tables = await Table.find({
    restaurantId: restaurant._id,
    isActive: true,
  }).lean();

  let targetTable = null;
  const targetTableId = payload.tableId || reservation.tableId;

  if (payload.tableId) {
    const selected = tables.find((t) => String(t._id) === String(payload.tableId));
    if (!selected) {
      throw new AppError("Selected table not found.", 404, "not_found");
    }
    if (selected.status === "maintenance") {
      throw new AppError("Selected table is currently unavailable.", 400, "validation_error");
    }
    if (selected.capacity < partySize) {
      throw new AppError(
        `Selected table ${selected.tableNumber} can seat at most ${selected.capacity} guests.`,
        400,
        "validation_error",
      );
    }
    const hasConflict = hasReservationConflict({
      tableId: selected._id,
      startMinutes,
      endMinutes,
      conflicts,
      excludeReservationId: reservation._id,
    });
    if (hasConflict) {
      throw new AppError(
        `Selected table ${selected.tableNumber} is not available at that time.`,
        409,
        "slot_unavailable",
      );
    }
    targetTable = selected;
  } else {
    // If tableId not explicitly changed, check if current table still fits and is free
    const currentTable = tables.find((t) => String(t._id) === String(targetTableId));
    if (
      currentTable &&
      currentTable.capacity >= partySize &&
      currentTable.status !== "maintenance" &&
      !hasReservationConflict({
        tableId: currentTable._id,
        startMinutes,
        endMinutes,
        conflicts,
        excludeReservationId: reservation._id,
      })
    ) {
      targetTable = currentTable;
    } else {
      // Find any free table that fits
      const free = tables.filter(
        (t) =>
          tableFits(t, partySize) &&
          !hasReservationConflict({
            tableId: t._id,
            startMinutes,
            endMinutes,
            conflicts,
            excludeReservationId: reservation._id,
          }),
      );
      if (free.length > 0) {
        targetTable = free[0];
      }
    }
  }

  if (!targetTable) {
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

  const hourlyRate =
    targetTable.hourlyReservationRate !== undefined ? targetTable.hourlyReservationRate : 300;
  const reservationFee = Math.round(hourlyRate * durationHours);
  const startDateTime = combineDateAndTime(date, startTime);
  const endDateTime = combineDateAndTime(date, endTime);

  reservation.date = date;
  reservation.time = startTime;
  reservation.endTime = endTime;
  reservation.partySize = partySize;
  reservation.tableId = targetTable._id;
  reservation.durationMinutes = durationMinutes;
  reservation.hourlyRate = hourlyRate;
  reservation.reservationFee = reservationFee;
  reservation.startDateTime = startDateTime;
  reservation.endDateTime = endDateTime;

  if (payload.specialRequest !== undefined) {
    reservation.specialRequest = payload.specialRequest;
  }
  await reservation.save();

  // In compliance with E-Receipt system: Generate revision snapshot (v2, v3...)
  try {
    await receiptService.createRevisionReceipt(reservation._id);
  } catch (err) {
    console.error("[receipt] Failed to create revision receipt:", err.message);
  }

  const updated = await Reservation.findById(id)
    .populate("restaurantId", "name cuisine images address city rating")
    .populate("tableId", "tableNumber capacity hourlyReservationRate")
    .lean();

  await notify({
    userId: reservation.userId,
    type: "reservation",
    title: "Reservation updated",
    body: `Your booking is now ${startTime} for ${partySize} at ${restaurant.name}.`,
    route: `/bookings/${reservation.bookingId}`,
    channel: "push",
  });

  return {
    message: "Your booking has been updated.",
    data: { reservation: shapeForCustomer(updated) },
  };
}

/**
 * POST /api/reservations/:id/cancel-request — customer requests cancellation (FR07).
 * Status transitions: confirmed -> cancellation_pending.
 * Table is NOT released while pending staff review.
 */
async function requestCancellation(id, requestingUser, rawReason) {
  const reservation = await Reservation.findById(id);
  if (!reservation) {
    throw new AppError("Reservation not found.", 404, "not_found");
  }

  const isOwner = String(reservation.userId) === String(requestingUser._id);
  const isStaff = ["staff", "manager"].includes(requestingUser.role);
  if (!isOwner && !isStaff) {
    throw new AppError(
      "You do not have permission to request cancellation for this booking.",
      403,
      "forbidden",
    );
  }

  const reason = String(rawReason || "").trim();
  if (!reason) {
    throw new AppError(
      "A cancellation reason is required.",
      400,
      "validation_error",
    );
  }

  if (reservation.status === "cancellation_pending") {
    throw new AppError(
      "A cancellation request is already pending review for this reservation.",
      409,
      "conflict",
    );
  }

  const now = new Date();
  if (!isUpcoming(reservation, now) || ["cancelled", "completed", "no-show"].includes(reservation.status)) {
    throw new AppError("Past or closed reservations cannot be cancelled.", 400, "reservation_closed");
  }

  reservation.status = "cancellation_pending";
  reservation.cancellationReason = reason;
  reservation.cancellationRequestedAt = new Date();
  await reservation.save();

  try {
    await receiptService.syncReceiptStatus(reservation._id, {
      reservationStatus: "cancellation_pending",
      cancellationDetails: {
        requestedAt: reservation.cancellationRequestedAt,
        reason: reservation.cancellationReason,
      },
    });
  } catch (err) {
    console.error("[receipt] Failed to sync cancellation_pending:", err.message);
  }

  // Note: Do NOT release the table while cancellation is pending.
  // The table remains held and blocking for availability.

  await notifyRestaurantStaff(reservation.restaurantId, {
    type: "reservation",
    title: "Cancellation Request Received",
    body: `Cancellation requested for booking ${reservation.bookingId}: "${reason}".`,
    route: `/staff/reservations/${reservation._id}`,
    data: {
      reservationId: String(reservation._id),
      bookingId: reservation.bookingId,
    },
  });

  await notify({
    userId: reservation.userId,
    type: "reservation",
    title: "Cancellation Requested",
    body: "Your cancellation request has been submitted and is pending staff review.",
    route: `/bookings/${reservation.bookingId}`,
    channel: "push",
  });

  const updated = await Reservation.findById(id)
    .populate("restaurantId", "name cuisine images address city rating")
    .populate("tableId", "tableNumber capacity")
    .lean();

  return {
    message: "Cancellation request submitted.",
    data: { reservation: shapeForCustomer(updated) },
  };
}

/**
 * DELETE /api/reservations/:id — cancel (FR07).
 * If invoked by customer, runs the cancellation-request workflow.
 * If invoked by staff, processes immediate cancellation.
 */
async function cancelReservation(id, requestingUser, reason = "") {
  const reservation = await Reservation.findById(id);
  if (!reservation) {
    throw new AppError("Reservation not found.", 404, "not_found");
  }

  const isOwner = String(reservation.userId) === String(requestingUser._id);
  const isStaff = ["staff", "manager"].includes(requestingUser.role);
  if (!isOwner && !isStaff) {
    throw new AppError("You do not have permission to cancel this booking.", 403, "forbidden");
  }

  // Customer must go through the cancellation-request workflow
  if (!isStaff) {
    return requestCancellation(id, requestingUser, reason);
  }

  if (["cancelled", "completed", "no-show"].includes(reservation.status)) {
    throw new AppError("This booking is already closed.", 409, "reservation_closed");
  }

  reservation.status = "cancelled";
  reservation.cancelledAt = new Date();
  reservation.cancellationReason = String(reason || "").trim();
  await reservation.save();

  try {
    await receiptService.syncReceiptStatus(reservation._id, {
      reservationStatus: "cancelled",
      cancellationDetails: {
        requestedAt: reservation.cancelledAt,
        reason: reservation.cancellationReason,
      },
    });
  } catch (err) {
    console.error("[receipt] Failed to sync cancelled status:", err.message);
  }

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

  const updated = await Reservation.findById(id)
    .populate("restaurantId", "name cuisine images address city rating")
    .populate("tableId", "tableNumber capacity")
    .lean();

  return {
    message: "Reservation cancelled.",
    data: { reservation: shapeForCustomer(updated) },
  };
}

/**
 * POST /api/reservations/:id/approve-cancellation — staff approves cancellation (Sobiyan).
 * Status transitions: cancellation_pending -> cancelled.
 * Table slot becomes available via availability logic.
 */
async function approveCancellation(id, staffUser) {
  const reservation = await Reservation.findById(id);
  if (!reservation) {
    throw new AppError("Reservation not found.", 404, "not_found");
  }

  if (!["staff", "manager"].includes(staffUser.role)) {
    throw new AppError("Only staff or managers can approve cancellations.", 403, "forbidden");
  }

  if (
    staffUser.restaurantId &&
    String(reservation.restaurantId) !== String(staffUser.restaurantId)
  ) {
    throw new AppError("Reservation belongs to another restaurant.", 403, "forbidden");
  }

  if (reservation.status !== "cancellation_pending") {
    throw new AppError(
      `Cannot approve cancellation for a reservation with status "${reservation.status}".`,
      409,
      "cancellation_not_pending",
    );
  }

  reservation.status = "cancelled";
  reservation.cancelledAt = new Date();
  reservation.cancellationReviewedBy = staffUser._id;
  reservation.cancellationReviewedAt = new Date();
  await reservation.save();

  try {
    await receiptService.syncReceiptStatus(reservation._id, {
      reservationStatus: "cancelled",
      cancellationDetails: {
        reviewedAt: reservation.cancellationReviewedAt,
        reviewComment: reservation.cancellationReviewComment,
      },
    });
  } catch (err) {
    console.error("[receipt] Failed to sync approved cancellation:", err.message);
  }

  await notify({
    userId: reservation.userId,
    type: "reservation",
    title: "Cancellation Request Approved",
    body: `Your cancellation request for booking ${reservation.bookingId} has been approved.`,
    route: `/bookings/${reservation.bookingId}`,
    channel: "push",
  });

  const updated = await Reservation.findById(id)
    .populate("restaurantId", "name cuisine images address city rating")
    .populate("tableId", "tableNumber capacity")
    .lean();

  return {
    message: "Cancellation request approved.",
    data: { reservation: shapeForCustomer(updated) },
  };
}

/**
 * POST /api/reservations/:id/reject-cancellation — staff rejects cancellation (Sobiyan).
 * Status transitions: cancellation_pending -> confirmed.
 * Reservation remains active.
 */
async function rejectCancellation(id, staffUser, rawComment = "") {
  const reservation = await Reservation.findById(id);
  if (!reservation) {
    throw new AppError("Reservation not found.", 404, "not_found");
  }

  if (!["staff", "manager"].includes(staffUser.role)) {
    throw new AppError("Only staff or managers can reject cancellations.", 403, "forbidden");
  }

  if (
    staffUser.restaurantId &&
    String(reservation.restaurantId) !== String(staffUser.restaurantId)
  ) {
    throw new AppError("Reservation belongs to another restaurant.", 403, "forbidden");
  }

  if (reservation.status !== "cancellation_pending") {
    throw new AppError(
      `Cannot reject cancellation for a reservation with status "${reservation.status}".`,
      409,
      "cancellation_not_pending",
    );
  }

  const comment = String(rawComment || "").trim();
  reservation.status = "confirmed";
  reservation.cancellationReviewedBy = staffUser._id;
  reservation.cancellationReviewedAt = new Date();
  reservation.cancellationReviewComment = comment;
  await reservation.save();

  try {
    await receiptService.syncReceiptStatus(reservation._id, {
      reservationStatus: "confirmed",
      cancellationDetails: {
        reviewedAt: reservation.cancellationReviewedAt,
        reviewComment: reservation.cancellationReviewComment,
      },
    });
  } catch (err) {
    console.error("[receipt] Failed to sync rejected cancellation:", err.message);
  }

  await notify({
    userId: reservation.userId,
    type: "reservation",
    title: "Cancellation Request Rejected",
    body: `Your cancellation request for booking ${reservation.bookingId} was not approved.${
      comment ? ` Note: ${comment}` : ""
    }`,
    route: `/bookings/${reservation.bookingId}`,
    channel: "push",
  });

  const updated = await Reservation.findById(id)
    .populate("restaurantId", "name cuisine images address city rating")
    .populate("tableId", "tableNumber capacity")
    .lean();

  return {
    message: "Cancellation request rejected.",
    data: { reservation: shapeForCustomer(updated) },
  };
}

/**
 * Staff view: today's reservations with search + check-in (FR09).
 */
async function listForStaff({ restaurantId, date, q = "", status = "" }) {
  const filter = { restaurantId };
  if (date) {
    filter.date = normalizeDate(date) || today();
  } else if (status !== "cancellation_pending") {
    filter.date = today();
  }

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
    date: filter.date || null,
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

  try {
    await receiptService.syncReceiptStatus(reservation._id, {
      reservationStatus: "checked-in",
    });
  } catch (err) {
    console.error("[receipt] Failed to sync checked-in:", err.message);
  }

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

  try {
    await receiptService.syncReceiptStatus(reservation._id, {
      reservationStatus: "no-show",
    });
  } catch (err) {
    console.error("[receipt] Failed to sync no-show:", err.message);
  }

  await Table.findOneAndUpdate(
    { _id: reservation.tableId, status: "reserved" },
    { status: "available", statusChangedAt: new Date() },
  );

  return {
    message: "Marked as no-show.",
    data: { reservation: { id: reservation._id, bookingId: reservation.bookingId, status: reservation.status } },
  };
}

/** FR09 — staff marks a checked-in reservation as completed. */
async function completeReservation(id, restaurantId) {
  const reservation = await Reservation.findById(id);
  if (!reservation) {
    throw new AppError("Reservation not found.", 404, "not_found");
  }
  if (restaurantId && String(reservation.restaurantId) !== String(restaurantId)) {
    throw new AppError("Reservation belongs to another restaurant.", 403, "forbidden");
  }
  if (reservation.status !== "checked-in") {
    throw new AppError("Only checked-in bookings can be completed.", 409, "invalid_status");
  }

  reservation.status = "completed";
  reservation.completedAt = new Date();
  await reservation.save();

  try {
    await receiptService.syncReceiptStatus(reservation._id, {
      reservationStatus: "completed",
    });
  } catch (err) {
    console.error("[receipt] Failed to sync completed:", err.message);
  }

  await Table.findByIdAndUpdate(reservation.tableId, {
    status: "available",
    statusChangedAt: new Date(),
  });

  try {
    await notifyEligibleOffers(reservation.userId, reservation.restaurantId);
  } catch (error) {
    console.error("[offers] eligibility notification failed:", error.message);
  }

  return {
    message: "Reservation completed.",
    data: { reservation: { id: reservation._id, bookingId: reservation.bookingId, status: reservation.status } },
  };
}

module.exports = {
  createReservation,
  listMine,
  getReservationById,
  updateReservation,
  requestCancellation,
  cancelReservation,
  approveCancellation,
  rejectCancellation,
  completeReservation,
  listForStaff,
  checkIn,
  markNoShow,
  resolveTable,
  shapeForCustomer,
};
