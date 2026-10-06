const express = require("express");

const {
  getReservations,
  createReservation,
  getReservationById,
  updateReservation,
  requestCancellation,
  cancelReservation,
  getStaffReservations,
  checkIn,
  markNoShow,
  completeReservation,
  approveCancellation,
  rejectCancellation,
} = require("../controllers/reservation.controller");
const { getReservationReceipt } = require("../controllers/receipt.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");

const router = express.Router();

// Every reservation route requires a signed-in user (NFR04).
router.use(authenticate);

// --- Staff (FR09): today's list with search + check-in ---
// Declared before "/:id" so "staff" is not read as a reservation id.
router.get("/staff", requireRole("staff", "manager"), getStaffReservations);

// --- Customer (FR02, FR07) ---
router.get("/", getReservations);
router.post("/", createReservation);
router.get("/:id", getReservationById);
router.get("/:id/receipt", getReservationReceipt);
router.put("/:id", updateReservation);
router.post("/:id/cancel-request", requestCancellation);
router.delete("/:id", cancelReservation);

// --- Staff actions (Sobiyan) ---
router.post("/:id/approve-cancellation", requireRole("staff", "manager"), approveCancellation);
router.post("/:id/reject-cancellation", requireRole("staff", "manager"), rejectCancellation);
router.post("/:id/check-in", requireRole("staff", "manager"), checkIn);
router.post("/:id/no-show", requireRole("staff", "manager"), markNoShow);
router.post("/:id/complete", requireRole("staff", "manager"), completeReservation);

module.exports = router;
