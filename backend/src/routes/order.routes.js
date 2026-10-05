const express = require("express");

const {
  getKitchenOrders,
  getOrders,
  createOrder,
  getOrderById,
  updateOrderStatus,
  deleteOrder,
} = require("../controllers/order.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");

const router = express.Router();

router.use(authenticate);

// Kitchen panel (Sobiyan) — placed before /:id so "kitchen" isn't treated as an ID
router.get("/kitchen", requireRole("staff", "manager"), getKitchenOrders);

// General orders
router.get("/", getOrders);
router.post("/", createOrder);
router.get("/:id", getOrderById);

// Kitchen status updates (Sobiyan)
router.patch("/:id/status", requireRole("staff", "manager"), updateOrderStatus);
router.post("/:id/status", requireRole("staff", "manager"), updateOrderStatus);
router.delete("/:id", requireRole("staff", "manager"), deleteOrder);

module.exports = router;

