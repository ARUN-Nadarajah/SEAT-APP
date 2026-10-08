const express = require("express");

const {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  clearNotifications,
  registerPushToken,
} = require("../controllers/notification.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticate);

router.get("/", getNotifications);
router.post("/read-all", markAllNotificationsRead);
router.post("/clear", clearNotifications);
router.post("/push-token", registerPushToken);
router.patch("/:id/read", markNotificationRead);

module.exports = router;
