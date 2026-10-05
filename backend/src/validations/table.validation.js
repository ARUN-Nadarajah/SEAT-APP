const { AppError } = require("../utils/errors");
const { assertObjectId } = require("../middleware/validation.middleware");

const TABLE_STATUSES = ["available", "occupied", "reserved", "maintenance"];

/** PATCH /api/tables/:id/status (FR08) */
function validateTableStatus(params = {}, body = {}) {
  const status = String(body.status || "").trim().toLowerCase();
  if (!TABLE_STATUSES.includes(status)) {
    throw new AppError(
      `Status must be one of: ${TABLE_STATUSES.join(", ")}.`,
      400,
      "validation_error",
    );
  }

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
  return result;
}

module.exports = {
  TABLE_STATUSES,
  validateTableStatus,
  validateTableQuery,
};
