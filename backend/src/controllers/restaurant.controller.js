const { asyncHandler } = require("../utils/errors");
const { success } = require("../utils/response");
const { validateQuery, validateParams } = require("../middleware/validation.middleware");
const { assertObjectId } = require("../middleware/validation.middleware");
const restaurantService = require("../services/restaurant.service");
const {
  validateRestaurantQuery,
  validateSlotQuery,
} = require("../validations/restaurant.validation");

/**
 * Restaurants (spec §7 / FR01 / FR02).
 * Every response carries `lastUpdated` so the UI can show
 * "Last updated" (NFR03).
 */

const parseId = (req) => assertObjectId(req.params.id, "restaurantId");

/** GET /api/restaurants — list with live availability (FR01). */
const getRestaurants = [
  validateQuery(validateRestaurantQuery),
  asyncHandler(async (req, res) => {
    const result = await restaurantService.listRestaurants(req.query);
    success(res, result);
  }),
];

/** GET /api/restaurants/search?q= — "Close to you" results. */
const searchRestaurants = [
  validateQuery(validateRestaurantQuery),
  asyncHandler(async (req, res) => {
    const result = await restaurantService.searchRestaurants(req.query.q, req.query);
    success(res, result);
  }),
];

/** GET /api/restaurants/:id — details + availability + slots. */
const getRestaurantById = asyncHandler(async (req, res) => {
  const id = parseId(req);
  const result = await restaurantService.getRestaurantById(id, {
    date: req.query.date,
    partySize: req.query.partySize,
  });
  success(res, result);
});

/** GET /api/restaurants/:id/slots — available time slots (FR02/FR07). */
const getAvailableSlots = [
  validateQuery(validateSlotQuery),
  asyncHandler(async (req, res) => {
    const id = parseId(req);
    const result = await restaurantService.getAvailableSlots(id, req.query);
    success(res, result);
  }),
];

/** GET /api/restaurants/:id/menu — "A taste of …" screen. */
const getMenu = asyncHandler(async (req, res) => {
  const id = parseId(req);
  const result = await restaurantService.getMenu(id);
  success(res, result);
});

/** POST /api/restaurants — manager/admin only (seed + admin tooling). */
const createRestaurant = asyncHandler(async (req, res) => {
  const restaurant = await restaurantService.createRestaurant(req.body);
  success(res, { data: restaurant }, 201);
});

/** PUT /api/restaurants/:id — manager edits venue details. */
const updateRestaurant = asyncHandler(async (req, res) => {
  const id = parseId(req);
  const Restaurant = require("../models/Restaurant");
  const restaurant = await Restaurant.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!restaurant) {
    return res.status(404).json({
      status: "error",
      message: "Restaurant not found.",
      code: "not_found",
    });
  }
  return success(res, { data: restaurant });
});

/** DELETE /api/restaurants/:id — soft-delete by marking inactive. */
const deleteRestaurant = asyncHandler(async (req, res) => {
  const id = parseId(req);
  const Restaurant = require("../models/Restaurant");
  const restaurant = await Restaurant.findByIdAndUpdate(
    id,
    { status: "inactive" },
    { new: true },
  );
  if (!restaurant) {
    return res.status(404).json({
      status: "error",
      message: "Restaurant not found.",
      code: "not_found",
    });
  }
  return success(res, { data: { id: restaurant._id, status: restaurant.status } });
});

module.exports = {
  getRestaurants,
  searchRestaurants,
  getRestaurantById,
  getAvailableSlots,
  getMenu,
  createRestaurant,
  updateRestaurant,
  deleteRestaurant,
};
