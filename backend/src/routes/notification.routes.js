const express = require("express");

const {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  registerPushToken,
} = require("../controllers/notification.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticate);

router.get("/", getNotifications);
router.post("/read-all", markAllNotificationsRead);
router.post("/push-token", registerPushToken);
router.patch("/:id/read", markNotificationRead);

module.exports = router;
