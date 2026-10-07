const { AppError } = require("../utils/errors");
const { assertObjectId } = require("../middleware/validation.middleware");

/** POST /api/queue/join (FR03) */
function validateJoinQueue(payload = {}) {
  return {
    restaurantId: assertObjectId(payload.restaurantId, "restaurantId"),
    orderId: payload.orderId ? assertObjectId(payload.orderId, "orderId") : null,
    orderSummary: String(payload.orderSummary || "").trim().slice(0, 200),
    guestName: String(payload.guestName || "").trim().slice(0, 80),
    guestPhone: String(payload.guestPhone || "").trim().slice(0, 30),
  };
}

/** Staff queue actions share a restaurant scope. */
function validateRestaurantScope(params = {}, query = {}) {
  const restaurantId = params.restaurantId || query.restaurantId;
  if (!restaurantId) {
    throw new AppError(
      "restaurantId is required.",
      400,
      "validation_error",
    );
  }
  return { restaurantId: assertObjectId(restaurantId, "restaurantId") };
}

function validateRemoveReason(body = {}) {
  const reason = String(body.reason || "no-show");
  if (!["no-show", "cancelled"].includes(reason)) {
    throw new AppError(
      "Reason must be 'no-show' or 'cancelled'.",
      400,
      "validation_error",
    );
  }
  return { reason };
}

module.exports = {
  validateJoinQueue,
  validateRestaurantScope,
  validateRemoveReason,
};
