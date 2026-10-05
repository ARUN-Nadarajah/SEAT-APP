const Table = require("../models/Table");
const Restaurant = require("../models/Restaurant");

const { AppError } = require("../utils/errors");
const { emitTableUpdated } = require("../realtime/events");
const { today } = require("../utils/time");

const STATUSES = ["available", "occupied", "reserved", "maintenance"];

function buildTablePayload(table) {
  return {
    id: table._id ? String(table._id) : table.id,
    _id: table._id ? String(table._id) : table._id,
    restaurantId: table.restaurantId ? String(table.restaurantId) : table.restaurantId,
    tableNumber: table.tableNumber,
    capacity: table.capacity,
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

async function createTable({ restaurantId, tableNumber, capacity, location, type, status }, user) {
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
  updateTable,
  updateTableStatus,
  replaceTables,
  ensureRestaurantExists,
  STATUSES,
};
