const express = require("express");

const {
  getPreview,
  addToQueue,
  getMyEntry,
  getQueue,
  removeFromQueue,
  callNext,
  notifyReady,
  seat,
  remove,
} = require("../controllers/queue.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");

const router = express.Router();

router.use(authenticate);

// --- Customer (FR03–FR06) ---
router.get("/preview", getPreview);
router.get("/mine", getMyEntry);
router.post("/join", addToQueue);
router.delete("/:id", removeFromQueue);

// --- Staff (FR06, FR09) — declared before "/:id" so ids resolve correctly ---
router.get("/staff/list", requireRole("staff", "manager"), getQueue);
router.post("/staff/call-next", requireRole("staff", "manager"), callNext);
router.post("/staff/:id/notify", requireRole("staff", "manager"), notifyReady);
router.post("/staff/:id/seat", requireRole("staff", "manager"), seat);
router.post("/staff/:id/remove", requireRole("staff", "manager"), remove);

module.exports = router;
