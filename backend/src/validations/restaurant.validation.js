const { AppError } = require("../utils/errors");
const { toInt, toDate, to24h } = require("../middleware/validation.middleware");

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

const PARKING_LABELS = ["Available", "Unavailable"];

/** Manager restaurant information update payload. */
function validateRestaurantUpdate(body = {}) {
  const fields = [
    ["name", "Restaurant name"],
    ["description", "Description"],
    ["phone", "Contact number"],
    ["address", "Address"],
    ["openingTime", "Opening time"],
    ["closingTime", "Closing time"],
    ["cuisine", "Cuisine type"],
  ];

  for (const [field, label] of fields) {
    if (typeof body[field] !== "string" || !body[field].trim()) {
      throw new AppError(`${label} is required.`, 400, "validation_error");
    }

    const phoneDigits = body.phone.replace(/\D/g, "");
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      throw new AppError(
        "Phone number must contain 10 to 15 digits.",
        400,
        "validation_error",
      );
    }
  }

  const openingTime = to24h(body.openingTime);
  const closingTime = to24h(body.closingTime);
  if (!openingTime || !closingTime) {
    throw new AppError(
      "Opening and closing times must be valid times.",
      400,
      "validation_error",
    );
  }

  const rawParkingLabel = String(body.parkingLabel || "").trim().toLowerCase();
  const parkingLabel =
    rawParkingLabel === "available" || rawParkingLabel === "parking available"
      ? "Available"
      : rawParkingLabel === "unavailable" || rawParkingLabel === "no parking"
        ? "Unavailable"
        : "";
  if (!parkingLabel) {
    throw new AppError(
      "Parking availability must be Available or Unavailable.",
      400,
      "validation_error",
    );
  }

  const images = Array.isArray(body.images) ? body.images : [];
  if (images.length > 0 && (
    typeof images[0] !== "string" ||
    !/^https?:\/\/\S+$/i.test(images[0].trim())
  )) {
    throw new AppError(
      "Cover image must be a valid http or https URL.",
      400,
      "validation_error",
    );
  }

  return {
    name: body.name.trim(),
    description: body.description.trim(),
    phone: body.phone.trim(),
    address: body.address.trim(),
    openingTime,
    closingTime,
    cuisine: body.cuisine.trim(),
    parking: parkingLabel === "Available",
    parkingLabel,
    images: images.length ? [images[0].trim()] : [],
  };
}

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
  PARKING_LABELS,
  validateRestaurantQuery,
  validateSlotQuery,
  validateRestaurantUpdate,
};
