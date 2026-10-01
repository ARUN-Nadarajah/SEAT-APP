const express = require("express");

const {
  getQueue,
  addToQueue,
  updateQueueStatus,
  removeFromQueue,
} = require("../controllers/queue.controller");

const router = express.Router();

router.get("/", getQueue);
router.post("/", addToQueue);
router.patch("/:id/status", updateQueueStatus);
router.delete("/:id", removeFromQueue);

module.exports = router;
