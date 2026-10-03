const { AppError } = require("../utils/errors");
const { toInt, toDate } = require("../middleware/validation.middleware");

const CUISINE_WHITELIST = [
  "Sri Lankan",
  "Jaffna Tamil",
  "Indian",
  "Chinese",
  "Seafood",
  "Cafe",
  "Bakery",
  "Fast Food",
];

/**
 * GET /api/restaurants — search/filter (spec §7).
 * Unknown cuisines are ignored rather than 400-ing, so the filter chips
 * on Explore can always be tapped safely.
 */
function validateRestaurantQuery(query = {}) {
  const page = toInt(query.page) || 1;
  const limit = Math.min(toInt(query.limit) || 50, 100);

  let cuisine = String(query.cuisine || "").trim();
  if (cuisine && !CUISINE_WHITELIST.some((c) => c.toLowerCase() === cuisine.toLowerCase())) {
    cuisine = "";
  }

  return {
    q: String(query.q || "").trim().slice(0, 80),
    cuisine,
    tonight: query.tonight === "true" || query.tonight === "1",
    partySize: Math.min(Math.max(toInt(query.partySize) || 2, 1), 20),
    date: query.date ? toDate(query.date) : null,
    page,
    limit,
  };
}

/** GET /api/restaurants/:id/slots?date=&partySize= */
function validateSlotQuery(query = {}) {
  if (query.date && !toDate(query.date)) {
    throw new AppError(
      "Please choose a valid date (YYYY-MM-DD).",
      400,
      "validation_error",
    );
  }
  return {
    date: query.date ? toDate(query.date) : null,
    partySize: Math.min(Math.max(toInt(query.partySize) || 2, 1), 20),
  };
}

module.exports = {
  CUISINE_WHITELIST,
  validateRestaurantQuery,
  validateSlotQuery,
};
