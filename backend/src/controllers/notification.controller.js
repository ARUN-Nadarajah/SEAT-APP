const { asyncHandler, AppError } = require("../utils/errors");
const { success } = require("../utils/response");
const { assertObjectId } = require("../middleware/validation.middleware");
const notificationService = require("../services/notification.service");
const { syncEligibleOfferNotifications } = require("../services/offer.service");

/**
 * Notifications (spec §7 / FR06).
 */

/** GET /api/notifications?unreadOnly=1 */
const getNotifications = asyncHandler(async (req, res) => {
  await syncEligibleOfferNotifications(req.user._id);
  const result = await notificationService.listNotifications(req.user._id, {
    unreadOnly: req.query.unreadOnly === "true" || req.query.unreadOnly === "1",
    type: req.query.type,
    limit: req.query.limit,
  });
  success(res, result);
});

/** PATCH /api/notifications/:id/read */
const markNotificationRead = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, "notificationId");
  const result = await notificationService.markRead(id, req.user._id);
  success(res, result);
});

/** POST /api/notifications/read-all */
const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAllRead(req.user._id);
  success(res, result);
});

/** POST /api/notifications/clear */
const clearNotifications = asyncHandler(async (req, res) => {
  const result = await notificationService.clearAll(req.user._id);
  success(res, result);
});

/** POST /api/notifications/push-token — register an Expo push token. */
const registerPushToken = asyncHandler(async (req, res) => {
  const token = String(req.body?.pushToken || "").trim();
  if (token && !token.startsWith("ExpoPushToken")) {
    throw new AppError(
      "That does not look like a valid Expo push token.",
      400,
      "validation_error",
    );
  }
  const result = await notificationService.registerPushToken(req.user._id, token);
  success(res, result);
});

module.exports = {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  clearNotifications,
  registerPushToken,
};
