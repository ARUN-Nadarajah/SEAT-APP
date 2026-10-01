const express = require("express");

const {
  getFoods,
  createFood,
  getFoodById,
  updateFood,
  deleteFood,
} = require("../controllers/food.controller");

const router = express.Router();

router.get("/", getFoods);
router.post("/", createFood);
router.get("/:id", getFoodById);
router.put("/:id", updateFood);
router.delete("/:id", deleteFood);

module.exports = router;
