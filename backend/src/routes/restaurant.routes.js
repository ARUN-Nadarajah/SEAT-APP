const express = require("express");

const {
  getRestaurants,
  searchRestaurants,
  getRestaurantById,
  getAvailableSlots,
  getMenu,
  createRestaurant,
  updateRestaurant,
  deleteRestaurant,
} = require("../controllers/restaurant.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");

const router = express.Router();

// Public browsing (FR01) — static paths must precede "/:id".
router.get("/", getRestaurants);
router.get("/search", searchRestaurants);

// FR02/FR07 — available time slots, including alternative suggestions.
router.get("/:id/slots", getAvailableSlots);
router.get("/:id/menu", getMenu);
router.get("/:id", getRestaurantById);

// Manager/Owner venue management.
router.post("/", authenticate, requireRole("manager"), createRestaurant);
router.put("/:id", authenticate, requireRole("manager"), updateRestaurant);
router.delete("/:id", authenticate, requireRole("manager"), deleteRestaurant);

module.exports = router;
