const { asyncHandler } = require("../utils/errors");
const { success } = require("../utils/response");
const { validateQuery } = require("../middleware/validation.middleware");
const tableService = require("../services/table.service");
const {
  validateTableQuery,
  validateTableStatus,
  validateTableInput,
  validateTableUpdate,
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

/** POST /api/tables — single create or bulk seed operation. */
const createTables = asyncHandler(async (req, res) => {
  const { restaurantId, tables } = req.body || {};

  if (Array.isArray(tables)) {
    if (!restaurantId) {
      return res.status(400).json({
        status: "error",
        message: "restaurantId and tables[] are required.",
        code: "validation_error",
      });
    }
    const created = await tableService.replaceTables(restaurantId, tables);
    return success(res, { data: created }, 201);
  }

  const payload = validateTableInput(req.body);
  const result = await tableService.createTable(payload, req.user);
  return success(res, result, 201);
});

/** PATCH /api/tables/:id — update a table's details. */
const updateTable = asyncHandler(async (req, res) => {
  const updates = validateTableUpdate(req.body);
  const result = await tableService.updateTable(req.params.id, updates, req.user);
  success(res, result);
});

/** PATCH /api/tables/:id/status — toggle table status (FR08). */
const updateTableStatus = asyncHandler(async (req, res) => {
  const { id, status } = validateTableStatus(req.params, req.body);
  const result = await tableService.updateTableStatus(id, status, req.user);
  success(res, result);
});

module.exports = {
  getTables,
  createTables,
  updateTable,
  updateTableStatus,
};
