const notImplemented = (message) => (req, res) => {
  res.status(200).json({
    message,
    status: "not_implemented",
  });
};

module.exports = {
  getOrders: notImplemented("Order listing endpoint is not implemented yet."),
  createOrder: notImplemented(
    "Order creation endpoint is not implemented yet.",
  ),
  getOrderById: notImplemented("Order detail endpoint is not implemented yet."),
  updateOrderStatus: notImplemented(
    "Order status update endpoint is not implemented yet.",
  ),
  deleteOrder: notImplemented(
    "Order deletion endpoint is not implemented yet.",
  ),
};
