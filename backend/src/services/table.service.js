const Table = require("../models/Table");
const Restaurant = require("../models/Restaurant");

const { AppError } = require("../utils/errors");
const { emitTableUpdated } = require("../realtime/events");
const { today } = require("../utils/time");

const STATUSES = ["available", "occupied", "reserved", "maintenance"];

/**
 * GET /api/tables — floor plan for the staff dashboard grid (FR08).
 */
async function listTables({ restaurantId, date }) {
  if (!restaurantId) {
    throw new AppError("restaurantId is required.", 400, "validation_error");
  }

  const bookingDate = date || today();

  const tables = await Table.find({ restaurantId })
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
    data: tables,
    summary: counts,
    date: bookingDate,
    lastUpdated: new Date().toISOString(),
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

  const payload = {
    id: table._id,
    restaurantId: table.restaurantId,
    tableNumber: table.tableNumber,
    capacity: table.capacity,
    status: table.status,
    statusChangedAt: table.statusChangedAt,
    lastUpdated: table.statusChangedAt.toISOString(),
  };

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

async function ensureRestaurantExists(restaurantId) {
  const restaurant = await Restaurant.findById(restaurantId).lean();
  if (!restaurant) {
    throw new AppError("Restaurant not found.", 404, "not_found");
  }
  return restaurant;
}

module.exports = {
  listTables,
  updateTableStatus,
  replaceTables,
  ensureRestaurantExists,
  STATUSES,
};
