const { AppError, asyncHandler } = require("../utils/errors");
const { success } = require("../utils/response");
const { assertObjectId } = require("../middleware/validation.middleware");
const { validateRestaurantScope } = require("../validations/queue.validation");
const orderService = require("../services/order.service");

/**
 * GET /api/orders/kitchen — Kitchen display system (Sobiyan).
 * Requires staff/manager role.
 */
const getKitchenOrders = asyncHandler(async (req, res) => {
  const { restaurantId } = validateRestaurantScope(req.body || {}, req.query);
  if (
    req.user.restaurantId &&
    String(req.user.restaurantId) !== String(restaurantId)
  ) {
    throw new AppError(
      "You do not have permission to access another restaurant.",
      403,
      "forbidden",
    );
  }
  const result = await orderService.listKitchenOrders(restaurantId, req.query.status);
  success(res, result);
});

/**
 * GET /api/orders — General order listing.
 */
const getOrders = asyncHandler(async (req, res) => {
  const result = await orderService.listOrders(req.user, req.query);
  success(res, result);
});

/**
 * POST /api/orders — Create order.
 */
const createOrder = asyncHandler(async (req, res) => {
  const result = await orderService.createOrder(req.user._id, req.body);
  success(res, result, 201);
});

/**
 * GET /api/orders/:id — Order details.
 */
const getOrderById = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, "orderId");
  const result = await orderService.getOrderById(id, req.user);
  success(res, result);
});

/**
 * PATCH /api/orders/:id/status or POST /api/orders/:id/status (Sobiyan).
 * Requires staff/manager role.
 */
const updateOrderStatus = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, "orderId");
  const status = req.body?.status;
  const result = await orderService.updateOrderStatus(id, status, req.user);
  success(res, result);
});

/**
 * DELETE /api/orders/:id — Cancel order.
 */
const deleteOrder = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, "orderId");
  const result = await orderService.deleteOrder(id, req.user);
  success(res, result);
});

const cancelOrder = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, "orderId");
  const result = await orderService.cancelOrder(id, req.user);
  success(res, result);
});

module.exports = {
  getKitchenOrders,
  getOrders,
  createOrder,
  getOrderById,
  updateOrderStatus,
  deleteOrder,
  cancelOrder,
};
