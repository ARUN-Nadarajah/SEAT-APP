const { asyncHandler } = require("../utils/errors");
const { success } = require("../utils/response");
const { assertObjectId } = require("../middleware/validation.middleware");
const managerService = require("../services/manager.service");

/**
 * Manager dashboard (FR10 + spec §7: "Manager: stats endpoint").
 * Restricted to `manager` at the route level.
 */

/** GET /api/manager/stats — summary cards + hourly chart series. */
const getStats = asyncHandler(async (req, res) => {
  const restaurantId = assertObjectId(
    req.query.restaurantId || req.user.restaurantId,
    "restaurantId",
  );

  const result = await managerService.getStats({
    restaurantId,
    date: req.query.date,
  });

  success(res, result);
});

/** GET /api/manager/daily?days=7 — date-filter daily breakdown. */
const getDaily = asyncHandler(async (req, res) => {
  const restaurantId = assertObjectId(
    req.query.restaurantId || req.user.restaurantId,
    "restaurantId",
  );

  const rows = await managerService.getDailyBreakdown(
    restaurantId,
    req.query.from || req.query.date,
    Number(req.query.days) || 7,
  );

  success(res, { data: rows, lastUpdated: new Date().toISOString() });
});

module.exports = { getStats, getDaily };
