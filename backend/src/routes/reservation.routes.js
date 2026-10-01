const express = require("express");

const {
  getReservations,
  createReservation,
  getReservationById,
  updateReservation,
  cancelReservation,
} = require("../controllers/reservation.controller");

const router = express.Router();

router.get("/", getReservations);
router.post("/", createReservation);
router.get("/:id", getReservationById);
router.put("/:id", updateReservation);
router.delete("/:id", cancelReservation);

module.exports = router;
