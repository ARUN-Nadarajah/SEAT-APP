const { AppError } = require("../utils/errors");
const { assertObjectId, assertIntRange } = require("../middleware/validation.middleware");

const TABLE_STATUSES = ["available", "occupied", "reserved", "maintenance"];

function normaliseStatus(value, { allowEmpty = false } = {}) {
  const status = String(value ?? "").trim().toLowerCase();
  if (!status && allowEmpty) return "";
  if (!TABLE_STATUSES.includes(status)) {
    throw new AppError(
      `Status must be one of: ${TABLE_STATUSES.join(", ")}.`,
      400,
      "validation_error",
    );
  }
  return status;
}

function validateTableInput(payload = {}) {
  const restaurantId = payload.restaurantId
    ? assertObjectId(payload.restaurantId, "restaurantId")
    : null;

  const tableNumber = String(payload.tableNumber ?? "").trim();
  if (!tableNumber) {
    throw new AppError("tableNumber is required.", 400, "validation_error");
  }

  const capacity = assertIntRange(payload.capacity, {
    min: 1,
    max: 20,
    fieldName: "capacity",
  });

  let hourlyReservationRate = 300;
  if (payload.hourlyReservationRate !== undefined) {
    const rate = Number(payload.hourlyReservationRate);
    if (!Number.isFinite(rate) || rate < 0) {
      throw new AppError("hourlyReservationRate must be a positive number.", 400, "validation_error");
    }
    hourlyReservationRate = rate;
  }

  const location = String(payload.location ?? "").trim();
  const type = String(payload.type ?? "Standard").trim() || "Standard";
  const status = normaliseStatus(payload.status ?? "available");

  return {
    restaurantId,
    tableNumber,
    capacity,
    hourlyReservationRate,
    location,
    type,
    status,
  };
}

function validateTableUpdate(payload = {}) {
  const next = {};

  if (payload.tableNumber !== undefined) {
    const tableNumber = String(payload.tableNumber).trim();
    if (!tableNumber) {
      throw new AppError("tableNumber is required.", 400, "validation_error");
    }
    next.tableNumber = tableNumber;
  }

  if (payload.capacity !== undefined) {
    next.capacity = assertIntRange(payload.capacity, {
      min: 1,
      max: 20,
      fieldName: "capacity",
    });
  }

  if (payload.hourlyReservationRate !== undefined) {
    const rate = Number(payload.hourlyReservationRate);
    if (!Number.isFinite(rate) || rate < 0) {
      throw new AppError("hourlyReservationRate must be a positive number.", 400, "validation_error");
    }
    next.hourlyReservationRate = rate;
  }

  if (payload.location !== undefined) {
    next.location = String(payload.location).trim();
  }

  if (payload.type !== undefined) {
    next.type = String(payload.type).trim() || "Standard";
  }

  if (payload.status !== undefined) {
    next.status = normaliseStatus(payload.status);
  }

  if (Object.keys(next).length === 0) {
    throw new AppError("No table fields to update.", 400, "validation_error");
  }

  return next;
}

/** PATCH /api/tables/:id/status (FR08) */
function validateTableStatus(params = {}, body = {}) {
  const status = normaliseStatus(body.status);

  return {
    id: assertObjectId(params.id, "tableId"),
    status,
  };
}

/** GET /api/tables?restaurantId= */
function validateTableQuery(query = {}) {
  const result = {};
  if (query.restaurantId) {
    result.restaurantId = assertObjectId(query.restaurantId, "restaurantId");
  }
  if (query.date) {
    result.date = String(query.date);
  }
  if (query.startTime || query.time) {
    result.startTime = String(query.startTime || query.time);
  }
  if (query.endTime) {
    result.endTime = String(query.endTime);
  }
  if (query.partySize) {
    result.partySize = Number(query.partySize);
  }
  return result;
}

/** GET /api/tables/available?restaurantId=&date=&startTime=&endTime=&partySize= */
function validateAvailableTablesQuery(query = {}) {
  const { validateReservationDate, validateReservationTimeRange } = require("../utils/time");

  const restaurantId = query.restaurantId ? assertObjectId(query.restaurantId, "restaurantId") : undefined;
  const date = validateReservationDate(query.date);
  const startTime = query.startTime || query.time;
  const endTime = query.endTime;
  const { startMinutes, endMinutes, durationMinutes, durationHours } =
    validateReservationTimeRange(startTime, endTime);

  const partySize = assertIntRange(query.partySize, {
    min: 1,
    max: 20,
    fieldName: "Party size",
  });

  return {
    restaurantId,
    date,
    startTime: query.startTime || query.time,
    endTime,
    partySize,
    startMinutes,
    endMinutes,
    durationMinutes,
    durationHours,
  };
}

/** GET /api/tables/slot-availability?restaurantId=&date=&partySize=&tableId=&startTime= */
function validateSlotAvailabilityQuery(query = {}) {
  const { validateReservationDate } = require("../utils/time");
  const { to24h } = require("../middleware/validation.middleware");

  const restaurantId = query.restaurantId ? assertObjectId(query.restaurantId, "restaurantId") : undefined;
  const date = validateReservationDate(query.date);
  const partySize = query.partySize
    ? assertIntRange(query.partySize, {
        min: 1,
        max: 20,
        fieldName: "Party size",
      })
    : 2;
  const tableId = query.tableId ? assertObjectId(query.tableId, "tableId") : undefined;
  const startTime = query.startTime || query.time ? to24h(query.startTime || query.time) : undefined;

  return {
    restaurantId,
    date,
    partySize,
    tableId,
    startTime,
  };
}

module.exports = {
  TABLE_STATUSES,
  validateTableStatus,
  validateTableQuery,
  validateAvailableTablesQuery,
  validateSlotAvailabilityQuery,
  validateTableInput,
  validateTableUpdate,
};
