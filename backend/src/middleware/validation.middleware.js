const { AppError } = require("../utils/errors");

/**
 * Request validation middleware (spec §1 / NFR04).
 *
 * Validators are plain functions that receive the incoming payload and
 * return a normalised copy, throwing `AppError(..., 400, "validation_error")`
 * on bad input. This mirrors the style already used by auth.validation.js,
 * so every route validates the same way.
 *
 *   router.post("/", validateBody(validateReservationRequest), handler);
 */

/** Normalise a query/body value into an integer, or null when unusable. */
function toInt(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Normalise a YYYY-MM-DD (or ISO) date into a Date, or null. */
function toDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** "7:30 PM" / "19:30" → "19:30", or null when not a valid time. */
function to24h(value) {
  if (!value) return null;
  const raw = String(value).trim().toUpperCase();
  const match = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!match) return null;

  let hours = Number.parseInt(match[1], 10);
  const minutes = match[2];
  const meridiem = match[3];

  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  if (hours > 23) return null;

  return `${String(hours).padStart(2, "0")}:${minutes}`;
}

/**
 * Wrap a validator so it runs against a request part.
 * @param {"body"|"query"|"params"} source
 * @param {(payload: object) => object} validator
 */
function validate(source, validator) {
  return (req, res, next) => {
    try {
      const result = validator(req[source]);
      if (result && typeof result === "object") {
        req[source] = result;
      }
      return next();
    } catch (error) {
      return next(
        error instanceof AppError
          ? error
          : new AppError("Invalid request.", 400, "validation_error"),
      );
    }
  };
}

const validateBody = (validator) => validate("body", validator);
const validateQuery = (validator) => validate("query", validator);
const validateParams = (validator) => validate("params", validator);

/**
 * Guard for shared int params (e.g. `:id` ObjectId strings).
 * Throws a 404-ish 400 when the id is malformed.
 */
function assertObjectId(value, fieldName = "id") {
  const str = String(value || "");
  if (!/^[0-9a-fA-F]{24}$/.test(str)) {
    throw new AppError(
      `A valid ${fieldName} is required.`,
      400,
      "validation_error",
    );
  }
  return str;
}

/** Require a positive integer within an inclusive range. */
function assertIntRange(value, { min = 1, max = 100, fieldName = "value" } = {}) {
  const parsed = toInt(value);
  if (parsed === null || parsed < min || parsed > max) {
    throw new AppError(
      `${fieldName} must be between ${min} and ${max}.`,
      400,
      "validation_error",
    );
  }
  return parsed;
}

module.exports = {
  validate,
  validateBody,
  validateQuery,
  validateParams,
  toInt,
  toDate,
  to24h,
  assertObjectId,
  assertIntRange,
};
