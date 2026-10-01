const express = require("express");

const {
  getRestaurants,
  createRestaurant,
  getRestaurantById,
  updateRestaurant,
  deleteRestaurant,
} = require("../controllers/restaurant.controller");

const router = express.Router();

router.get("/", getRestaurants);
router.post("/", createRestaurant);
router.get("/:id", getRestaurantById);
router.put("/:id", updateRestaurant);
router.delete("/:id", deleteRestaurant);

module.exports = router;
