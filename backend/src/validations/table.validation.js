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
  if (!query.restaurantId) {
    throw new AppError("restaurantId is required.", 400, "validation_error");
  }
  return { restaurantId: assertObjectId(query.restaurantId, "restaurantId") };
}

module.exports = {
  TABLE_STATUSES,
  validateTableStatus,
  validateTableQuery,
};
