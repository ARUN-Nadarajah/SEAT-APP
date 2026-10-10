const Table = require("../models/Table");
const Restaurant = require("../models/Restaurant");
const Reservation = require("../models/Reservation");

const { AppError } = require("../utils/errors");
const { emitTableUpdated } = require("../realtime/events");
const {
  today,
  timeToMinutes,
  minutesToTime,
  formatTime,
  validateReservationDate,
  validateReservationTimeRange,
} = require("../utils/time");
const {
  blockingReservations,
  hasReservationConflict,
} = require("../utils/availability");

const STATUSES = ["available", "occupied", "reserved", "maintenance"];

function buildTablePayload(table) {
  return {
    id: table._id ? String(table._id) : table.id,
    _id: table._id ? String(table._id) : table._id,
    restaurantId: table.restaurantId ? String(table.restaurantId) : table.restaurantId,
    tableNumber: table.tableNumber,
    capacity: table.capacity,
    hourlyReservationRate:
      table.hourlyReservationRate !== undefined ? table.hourlyReservationRate : 300,
    location: table.location || "",
    type: table.type || "Standard",
    status: table.status,
    isActive: table.isActive,
    statusChangedAt: table.statusChangedAt,
    lastUpdated: table.statusChangedAt ? table.statusChangedAt.toISOString?.() : new Date().toISOString(),
  };
}

async function ensureRestaurantExists(restaurantId) {
  const restaurant = await Restaurant.findById(restaurantId).lean();
  if (!restaurant) {
    throw new AppError("Restaurant not found.", 404, "not_found");
  }
  return restaurant;
}

async function createTable(
  { restaurantId, tableNumber, capacity, hourlyReservationRate, location, type, status },
  user,
) {
  if (!restaurantId) {
    throw new AppError("restaurantId is required.", 400, "validation_error");
  }

  await ensureRestaurantExists(restaurantId);

  if (user?.restaurantId && String(user.restaurantId) !== String(restaurantId)) {
    throw new AppError("This restaurant does not belong to this staff account.", 403, "forbidden");
  }

  const trimmedNumber = String(tableNumber || "").trim();
  if (!trimmedNumber) {
    throw new AppError("tableNumber is required.", 400, "validation_error");
  }

  const normalizedCapacity = Number.parseInt(String(capacity), 10);
  if (!Number.isInteger(normalizedCapacity) || normalizedCapacity < 1 || normalizedCapacity > 20) {
    throw new AppError("capacity must be between 1 and 20 seats.", 400, "validation_error");
  }

  const finalRate =
    hourlyReservationRate !== undefined && Number.isFinite(Number(hourlyReservationRate))
      ? Number(hourlyReservationRate)
      : 300;

  const finalStatus = STATUSES.includes(String(status || "").trim().toLowerCase())
    ? String(status).trim().toLowerCase()
    : "available";

  const existing = await Table.findOne({ restaurantId, tableNumber: trimmedNumber }).lean();
  if (existing) {
    throw new AppError("A table with that number already exists in this restaurant.", 409, "duplicate_table");
  }

  const created = await Table.create({
    restaurantId,
    tableNumber: trimmedNumber,
    capacity: normalizedCapacity,
    hourlyReservationRate: finalRate,
    location: String(location || "").trim(),
    type: String(type || "Standard").trim() || "Standard",
    status: finalStatus,
    isActive: true,
    statusChangedAt: new Date(),
    statusChangedBy: user?._id || null,
  });

  const payload = buildTablePayload(created.toObject ? created.toObject() : created);
  emitTableUpdated(restaurantId, payload);

  return { message: "Table added successfully.", data: payload };
}

/**
 * GET /api/tables — floor plan for the staff dashboard grid (FR08).
 */
async function listTables({ restaurantId, date }) {
  let targetRestaurantId = restaurantId;
  if (!targetRestaurantId) {
    const defaultRestaurant = await Restaurant.findOne({ status: { $ne: "inactive" } }).lean();
    if (defaultRestaurant) {
      targetRestaurantId = defaultRestaurant._id;
    } else {
      throw new AppError("restaurantId is required.", 400, "validation_error");
    }
  }

  const bookingDate = date || today();

  await releaseExpiredReservationTables();

  const tables = await Table.find({ restaurantId: targetRestaurantId })
    .sort({ tableNumber: 1 })
    .lean();

  const counts = tables.reduce(
    (acc, table) => {
      acc[table.status] = (acc[table.status] || 0) + 1;
      acc.total += 1;
      return acc;
    },
    { total: 0, available: 0, occupied: 0, reserved: 0, maintenance: 0 },
  );

  return {
    data: tables.map((table) => ({ ...table, id: String(table._id), _id: String(table._id) })),
    summary: counts,
    date: bookingDate,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Release tables whose active reservation has reached its selected end time.
 * Reservation time ranges remain the source of truth for booking availability;
 * this keeps the staff floor status in sync for reservations that were checked in.
 */
async function releaseExpiredReservationTables(now = new Date()) {
  const expiredReservations = await Reservation.find({
    endDateTime: { $ne: null, $lte: now },
    status: { $in: ["confirmed", "checked-in", "cancellation_pending"] },
  }).select("_id tableId restaurantId").lean();

  for (const reservation of expiredReservations) {
    const table = await Table.findOneAndUpdate(
      {
        _id: reservation.tableId,
        status: { $in: ["occupied", "reserved"] },
      },
      {
        $set: {
          status: "available",
          statusChangedAt: now,
          statusChangedBy: null,
        },
      },
      { new: true },
    );

    if (table) {
      emitTableUpdated(table.restaurantId, buildTablePayload(table.toObject()));
    }
  }

  return expiredReservations.length;
}

async function updateTable(tableId, updates, user) {
  const table = await Table.findById(tableId);
  if (!table) {
    throw new AppError("Table not found.", 404, "not_found");
  }

  if (user?.restaurantId && String(table.restaurantId) !== String(user.restaurantId)) {
    throw new AppError("This table belongs to another restaurant.", 403, "forbidden");
  }

  const next = { ...updates };
  if (next.tableNumber !== undefined) {
    const trimmed = String(next.tableNumber).trim();
    if (!trimmed) {
      throw new AppError("tableNumber is required.", 400, "validation_error");
    }
    next.tableNumber = trimmed;
  }
  if (next.capacity !== undefined) {
    const capacity = Number.parseInt(String(next.capacity), 10);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 20) {
      throw new AppError("capacity must be between 1 and 20 seats.", 400, "validation_error");
    }
    next.capacity = capacity;
  }
  if (next.location !== undefined) next.location = String(next.location).trim();
  if (next.type !== undefined) next.type = String(next.type).trim() || "Standard";
  if (next.hourlyReservationRate !== undefined) {
    const rate = Number(next.hourlyReservationRate);
    if (!Number.isFinite(rate) || rate < 0) {
      throw new AppError("hourlyReservationRate must be a positive number.", 400, "validation_error");
    }
    next.hourlyReservationRate = rate;
  }
  if (next.status !== undefined) {
    const status = String(next.status).trim().toLowerCase();
    if (!STATUSES.includes(status)) {
      throw new AppError(
        `Status must be one of: ${STATUSES.join(", ")}.`,
        400,
        "validation_error",
      );
    }
    next.status = status;
  }

  const changed = Object.keys(next).some((key) => String(table[key]) !== String(next[key]));
  if (!changed) {
    throw new AppError("No table fields to update.", 400, "validation_error");
  }

  Object.assign(table, next);
  table.statusChangedAt = new Date();
  table.statusChangedBy = user?._id || table.statusChangedBy || null;
  await table.save();

  const payload = buildTablePayload(table.toObject ? table.toObject() : table);
  emitTableUpdated(table.restaurantId, payload);

  return { message: "Table details updated successfully.", data: payload };
}

/**
 * GET /api/tables/available — Dynamic Available Tables API (Section 6).
 * Finds tables free for [startTime, endTime) taking into account 30-min buffer.
 */
async function getAvailableTables({
  restaurantId,
  date,
  startTime,
  endTime,
  partySize,
}) {
  await releaseExpiredReservationTables();

  let targetRestaurantId = restaurantId;
  if (!targetRestaurantId) {
    const defaultRestaurant = await Restaurant.findOne({ status: { $ne: "inactive" } }).lean();
    if (defaultRestaurant) {
      targetRestaurantId = defaultRestaurant._id;
    } else {
      throw new AppError("restaurantId is required.", 400, "validation_error");
    }
  }

  const validDate = validateReservationDate(date);
  const { startMinutes, endMinutes, durationMinutes, durationHours } =
    validateReservationTimeRange(startTime, endTime);
  const guests = Number(partySize) || 1;

  const [tables, reservations] = await Promise.all([
    Table.find({
      restaurantId: targetRestaurantId,
      isActive: true,
      status: { $ne: "maintenance" },
      capacity: { $gte: guests },
    }).lean(),
    Reservation.find({
      restaurantId: targetRestaurantId,
      date: validDate,
      status: { $in: ["confirmed", "checked-in", "cancellation_pending"] },
    }).lean(),
  ]);

  const conflicts = blockingReservations(reservations);

  const availableTables = tables.filter((t) => {
    return !hasReservationConflict({
      tableId: t._id,
      startMinutes,
      endMinutes,
      conflicts,
    });
  });

  const formatted = availableTables.map((table) => {
    const hourlyReservationRate =
      table.hourlyReservationRate !== undefined ? table.hourlyReservationRate : 300;
    const reservationFee = Math.round(hourlyReservationRate * durationHours);
    return {
      id: String(table._id),
      _id: String(table._id),
      tableNumber: table.tableNumber,
      capacity: table.capacity,
      location: table.location || "Indoor",
      type: table.type || "Standard",
      status: table.status,
      isActive: table.isActive,
      hourlyReservationRate,
      reservationFee,
      durationMinutes,
      durationHours,
    };
  });

  // Sort logically: capacity ascending (best fit), then tableNumber ascending
  formatted.sort((a, b) => {
    if (a.capacity !== b.capacity) return a.capacity - b.capacity;
    return a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true });
  });

  return {
    data: formatted,
    count: formatted.length,
    date: validDate.toISOString().slice(0, 10),
    startTime,
    endTime,
    partySize: guests,
  };
}

/**
 * GET /api/tables/slot-availability — Returns availability of all 30-min start and end slots.
 * Grey out unavailable slots in the UI (cannot be selected).
 */
async function getSlotAvailability({
  restaurantId,
  date,
  partySize = 2,
  tableId,
  startTime,
}) {
  let targetRestaurantId = restaurantId;
  if (!targetRestaurantId) {
    const defaultRestaurant = await Restaurant.findOne({ status: { $ne: "inactive" } }).lean();
    if (defaultRestaurant) {
      targetRestaurantId = defaultRestaurant._id;
    } else {
      throw new AppError("restaurantId is required.", 400, "validation_error");
    }
  }

  const validDate = validateReservationDate(date);
  const guests = Number(partySize) || 2;

  // Find all active non-maintenance tables in this restaurant
  const allActiveTables = await Table.find({
    restaurantId: targetRestaurantId,
    isActive: true,
    status: { $ne: "maintenance" },
  }).lean();

  const maxCapacity = allActiveTables.reduce((max, t) => Math.max(max, t.capacity || 0), 0);

  let tables = [];
  if (tableId) {
    // If a specific table was requested, check if it can accommodate the party size
    tables = allActiveTables.filter(
      (t) => String(t._id) === String(tableId) && t.capacity >= guests,
    );
  }

  // If no tableId was provided OR the requested table cannot accommodate the party size (e.g. partySize changed to 5+),
  // evaluate availability across all tables that fit this party size
  if (tables.length === 0) {
    tables = allActiveTables.filter((t) => t.capacity >= guests);
  }

  const reservations = await Reservation.find({
    restaurantId: targetRestaurantId,
    date: validDate,
    status: { $in: ["confirmed", "checked-in", "cancellation_pending"] },
  }).lean();

  const conflicts = blockingReservations(reservations);

  // Operating hours: 8:00 AM (480) to 10:00 PM (1320)
  // Start slots: 480 to 1290 (9:30 PM) in 30-min steps
  const startSlots = [];
  for (let m = 480; m <= 1290; m += 30) {
    const timeStr = minutesToTime(m);
    const free = tables.filter(
      (t) =>
        !hasReservationConflict({
          tableId: t._id,
          startMinutes: m,
          endMinutes: m + 30,
          conflicts,
        }),
    );
    startSlots.push({
      time: timeStr,
      timeLabel: formatTime(timeStr),
      available: free.length > 0,
      tableCount: free.length,
    });
  }

  // End slots for selected startTime (from startTime + 30 to 1320)
  const endSlots = [];
  if (startTime) {
    const startMin = timeToMinutes(startTime);
    if (startMin !== null && startMin >= 480 && startMin < 1320) {
      for (let m = startMin + 30; m <= 1320; m += 30) {
        const timeStr = minutesToTime(m);
        const free = tables.filter(
          (t) =>
            !hasReservationConflict({
              tableId: t._id,
              startMinutes: startMin,
              endMinutes: m,
              conflicts,
            }),
        );
        endSlots.push({
          time: timeStr,
          timeLabel: formatTime(timeStr),
          durationMinutes: m - startMin,
          available: free.length > 0,
          tableCount: free.length,
        });
      }
    }
  }

  const payload = {
    date: validDate.toISOString().slice(0, 10),
    partySize: guests,
    tableId: tableId ? String(tableId) : null,
    maxCapacity,
    hasTablesForPartySize: tables.length > 0,
    startSlots,
    endSlots,
  };

  return {
    data: payload,
    ...payload,
  };
}

/**
 * PATCH /api/tables/:id/status — toggle Available / Occupied / Reserved (FR08).
 * Emits `table:updated` so every open dashboard refreshes instantly.
 */
async function updateTableStatus(tableId, status, user) {
  if (!STATUSES.includes(status)) {
    throw new AppError(
      `Status must be one of: ${STATUSES.join(", ")}.`,
      400,
      "validation_error",
    );
  }

  const table = await Table.findById(tableId);
  if (!table) {
    throw new AppError("Table not found.", 404, "not_found");
  }

  if (
    user?.restaurantId &&
    String(table.restaurantId) !== String(user.restaurantId)
  ) {
    throw new AppError(
      "This table belongs to another restaurant.",
      403,
      "forbidden",
    );
  }

  table.status = status;
  table.statusChangedAt = new Date();
  table.statusChangedBy = user?._id || null;
  await table.save();

  const payload = buildTablePayload(table.toObject ? table.toObject() : table);
  emitTableUpdated(table.restaurantId, payload);

  return { message: `Table ${table.tableNumber} is now ${status}.`, data: payload };
}

/** Create/replace tables for a venue — used by the seed script. */
async function replaceTables(restaurantId, tables) {
  await Table.deleteMany({ restaurantId });
  return Table.insertMany(
    tables.map((table) => ({ ...table, restaurantId })),
  );
}

module.exports = {
  createTable,
  listTables,
  getAvailableTables,
  getSlotAvailability,
  updateTable,
  updateTableStatus,
  releaseExpiredReservationTables,
  replaceTables,
  ensureRestaurantExists,
  STATUSES,
};
