const { asyncHandler } = require("../utils/errors");
const { success } = require("../utils/response");
const { validateQuery } = require("../middleware/validation.middleware");
const tableService = require("../services/table.service");
const {
  validateTableQuery,
  validateTableStatus,
} = require("../validations/table.validation");

/**
 * Tables (spec §7 / FR08).
 * Staff dashboard toggles Available / Occupied / Reserved.
 */

/** GET /api/tables?restaurantId= — floor plan grid. */
const getTables = [
  validateQuery(validateTableQuery),
  asyncHandler(async (req, res) => {
    const result = await tableService.listTables({
      restaurantId: req.query.restaurantId,
      date: req.query.date,
    });
    success(res, result);
  }),
];

/** PATCH /api/tables/:id/status — toggle table status (FR08). */
const updateTableStatus = asyncHandler(async (req, res) => {
  // Validates params.id and body.status together (FR08).
  const { id, status } = validateTableStatus(req.params, req.body);
  const result = await tableService.updateTableStatus(id, status, req.user);
  success(res, result);
});

/** POST /api/tables — bulk create (seed / manager tooling). */
const createTables = asyncHandler(async (req, res) => {
  const { restaurantId, tables } = req.body || {};
  if (!restaurantId || !Array.isArray(tables)) {
    return res.status(400).json({
      status: "error",
      message: "restaurantId and tables[] are required.",
      code: "validation_error",
    });
  }
  const created = await tableService.replaceTables(restaurantId, tables);
  return success(res, { data: created }, 201);
});

module.exports = {
  getTables,
  updateTableStatus,
  createTables,
};
