const { AppError } = require("../utils/errors");
const {
  assertObjectId,
  assertIntRange,
} = require("../middleware/validation.middleware");

/** POST /api/queue/join (FR03) */
function validateJoinQueue(payload = {}) {
  return {
    restaurantId: assertObjectId(payload.restaurantId, "restaurantId"),
    partySize: assertIntRange(payload.partySize, {
      min: 1,
      max: 20,
      fieldName: "Party size",
    }),
    guestName: String(payload.guestName || "").trim().slice(0, 80),
    guestPhone: String(payload.guestPhone || "").trim().slice(0, 30),
  };
}

/** Staff queue actions: /call-next, /:id/notify, /:id/seat, /:id/remove */
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
  if (!["no-show", "left"].includes(reason)) {
    throw new AppError(
      "Reason must be 'no-show' or 'left'.",
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
