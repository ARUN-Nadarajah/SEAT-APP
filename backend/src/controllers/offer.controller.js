const { AppError, asyncHandler } = require("../utils/errors");
const { success } = require("../utils/response");
const { assertObjectId, validateBody } = require("../middleware/validation.middleware");
const { validateOffer } = require("../validations/offer.validation");
const Restaurant = require("../models/Restaurant");
const offerService = require("../services/offer.service");

async function managerRestaurantId(req) {
  const id = req.user && req.user.restaurantId;
  if (id) return assertObjectId(id, "restaurantId");

  // Manager accounts created before restaurant assignment can still use the
  // manager flow; bind them to the first available venue once.
  const restaurant = await Restaurant.findOne().sort({ createdAt: 1 });
  if (!restaurant) {
    throw new AppError(
      "No restaurant is available for this manager account.",
      400,
      "restaurant_required",
    );
  }
  req.user.restaurantId = restaurant._id;
  await req.user.save();
  return restaurant._id.toString();
}

const getManagerOffers = asyncHandler(async (req, res) => {
  const data = await offerService.listForManager(await managerRestaurantId(req));
  success(res, { data, lastUpdated: new Date().toISOString() });
});

const createOffer = [
  validateBody(validateOffer),
  asyncHandler(async (req, res) => {
    const data = await offerService.create(await managerRestaurantId(req), req.body);
    success(res, { data }, 201);
  }),
];

const updateOffer = [
  validateBody(validateOffer),
  asyncHandler(async (req, res) => {
    const id = assertObjectId(req.params.id, "offerId");
    const data = await offerService.update(await managerRestaurantId(req), id, req.body);
    success(res, { data });
  }),
];

const deleteOffer = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, "offerId");
  const data = await offerService.remove(await managerRestaurantId(req), id);
  success(res, { data });
});

const getEligibleOffers = asyncHandler(async (req, res) => {
  const restaurantId = assertObjectId(req.params.restaurantId, "restaurantId");
  const result = await offerService.listEligible(restaurantId, req.user._id);
  success(res, {
    data: result.offers,
    completedReservations: result.completedReservations,
    lastUpdated: new Date().toISOString(),
  });
});

module.exports = {
  getManagerOffers,
  createOffer,
  updateOffer,
  deleteOffer,
  getEligibleOffers,
};
