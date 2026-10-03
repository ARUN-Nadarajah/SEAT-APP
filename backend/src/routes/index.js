const express = require("express");

const authRoutes = require("./auth.routes");
const foodRoutes = require("./food.routes");
const managerRoutes = require("./manager.routes");
const notificationRoutes = require("./notification.routes");
const orderRoutes = require("./order.routes");
const queueRoutes = require("./queue.routes");
const reservationRoutes = require("./reservation.routes");
const restaurantRoutes = require("./restaurant.routes");
const tableRoutes = require("./table.routes");
const userRoutes = require("./user.routes");

const router = express.Router();

router.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    api: "seat-app-backend",
  });
});

// --- Spec §7: REST API surface ---
router.use("/auth", authRoutes);
router.use("/restaurants", restaurantRoutes);
router.use("/reservations", reservationRoutes);
router.use("/queue", queueRoutes);
router.use("/tables", tableRoutes);
router.use("/notifications", notificationRoutes);
router.use("/manager", managerRoutes);

// --- Pre-existing scaffold modules (kept as-is) ---
router.use("/foods", foodRoutes);
router.use("/orders", orderRoutes);
router.use("/users", userRoutes);

module.exports = router;
