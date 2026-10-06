const { AppError } = require("../utils/errors");
const {
  assertObjectId,
  assertIntRange,
  to24h,
  toDate,
} = require("../middleware/validation.middleware");

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function assertTime(value) {
  const normalised = to24h(value);
  if (!normalised || !TIME_PATTERN.test(normalised)) {
    throw new AppError(
      "Please choose a valid time.",
      400,
      "validation_error",
    );
  }
  return normalised;
}

function assertDate(value) {
  const date = toDate(value);
  if (!date) {
    throw new AppError(
      "Please choose a valid date (YYYY-MM-DD).",
      400,
      "validation_error",
    );
  }
  return date;
}

function assertOptionalText(value, maxLength, fieldName) {
  const text = String(value || "").trim();
  if (text.length > maxLength) {
    throw new AppError(
      `${fieldName} must be ${maxLength} characters or fewer.`,
      400,
      "validation_error",
    );
  }
  return text;
}

/** POST /api/reservations */
function validateCreateReservation(payload = {}) {
  const timeValue = payload.startTime || payload.time;
  const time = assertTime(timeValue);
  const result = {
    restaurantId: assertObjectId(payload.restaurantId, "restaurantId"),
    tableId: payload.tableId ? assertObjectId(payload.tableId, "tableId") : undefined,
    date: assertDate(payload.date),
    time,
    startTime: payload.startTime ? assertTime(payload.startTime) : time,
    partySize: assertIntRange(payload.partySize, {
      min: 1,
      max: 20,
      fieldName: "Party size",
    }),
    guestName: assertOptionalText(payload.guestName, 80, "Guest name"),
    guestPhone: assertOptionalText(payload.guestPhone, 30, "Phone number"),
    specialRequest: assertOptionalText(
      payload.specialRequest,
      300,
      "Special request",
    ),
    notes: assertOptionalText(payload.notes, 300, "Notes"),
  };
  if (payload.endTime !== undefined) {
    result.endTime = assertTime(payload.endTime);
  }
  return result;
}

/** PUT /api/reservations/:id — all fields optional (FR07). */
function validateUpdateReservation(payload = {}) {
  const result = {};

  if (payload.restaurantId !== undefined) {
    result.restaurantId = assertObjectId(payload.restaurantId, "restaurantId");
  }
  if (payload.tableId !== undefined) {
    result.tableId = assertObjectId(payload.tableId, "tableId");
  }
  if (payload.date !== undefined) result.date = assertDate(payload.date);
  if (payload.time !== undefined) result.time = assertTime(payload.time);
  if (payload.startTime !== undefined) {
    result.startTime = assertTime(payload.startTime);
    if (!result.time) result.time = result.startTime;
  }
  if (payload.endTime !== undefined) {
    result.endTime = assertTime(payload.endTime);
  }
  if (payload.partySize !== undefined) {
    result.partySize = assertIntRange(payload.partySize, {
      min: 1,
      max: 20,
      fieldName: "Party size",
    });
  }
  if (payload.specialRequest !== undefined) {
    result.specialRequest = assertOptionalText(
      payload.specialRequest,
      300,
      "Special request",
    );
  }

  return result;
}

/** GET /api/reservations — `?upcoming=1` */
function validateReservationQuery(query = {}) {
  const result = {};
  if (query.status) result.status = String(query.status);
  if (query.upcoming !== undefined) result.upcoming = query.upcoming === "true" || query.upcoming === "1";
  return result;
}

/** GET /api/restaurants/staff?restaurantId=&date=&q= */
function validateStaffListQuery(query = {}) {
  return {
    restaurantId: assertObjectId(
      query.restaurantId || query.restaurant,
      "restaurantId",
    ),
    date: query.date ? assertDate(query.date) : undefined,
    q: String(query.q || "").trim().slice(0, 80),
    status: query.status ? String(query.status) : "",
  };
}

/** POST /api/reservations/:id/cancel-request */
function validateCancellationRequest(payload = {}) {
  const reason = String(payload.reason || "").trim();
  if (!reason) {
    throw new AppError(
      "A cancellation reason is required.",
      400,
      "validation_error",
    );
  }
  if (reason.length > 300) {
    throw new AppError(
      "Cancellation reason must be 300 characters or fewer.",
      400,
      "validation_error",
    );
  }
  return { reason };
}

module.exports = {
  assertTime,
  assertDate,
  assertOptionalText,
  validateCreateReservation,
  validateUpdateReservation,
  validateReservationQuery,
  validateStaffListQuery,
  validateCancellationRequest,
};
