const express = require("express");

const {
  getNotifications,
  createNotification,
  markNotificationRead,
  deleteNotification,
} = require("../controllers/notification.controller");

const router = express.Router();

router.get("/", getNotifications);
router.post("/", createNotification);
router.patch("/:id/read", markNotificationRead);
router.delete("/:id", deleteNotification);

module.exports = router;
