const express = require("express");

const {
  getPreview,
  addToQueue,
  getMyEntry,
  getQueue,
  removeFromQueue,
  callNext,
  remove,
  markPreparing,
  markReady,
  markCollected,
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
router.post("/staff/:id/remove", requireRole("staff", "manager"), remove);
router.post("/staff/:id/start-preparing", requireRole("staff", "manager"), markPreparing);
// Backward-compatible alias for clients that have not refreshed yet.
router.post("/staff/:id/preparing", requireRole("staff", "manager"), markPreparing);
router.post("/staff/:id/ready", requireRole("staff", "manager"), markReady);
router.post("/staff/:id/collected", requireRole("staff", "manager"), markCollected);
router.post("/staff/:id/collect", requireRole("staff", "manager"), markCollected);

module.exports = router;
