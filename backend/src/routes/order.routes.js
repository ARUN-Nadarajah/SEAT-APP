const express = require("express");

const {
  getOrders,
  createOrder,
  getOrderById,
  updateOrderStatus,
  deleteOrder,
} = require("../controllers/order.controller");

const router = express.Router();

router.get("/", getOrders);
router.post("/", createOrder);
router.get("/:id", getOrderById);
router.patch("/:id/status", updateOrderStatus);
router.delete("/:id", deleteOrder);

module.exports = router;
