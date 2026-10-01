const notImplemented = (message) => (req, res) => {
  res.status(200).json({
    message,
    status: "not_implemented",
  });
};

module.exports = {
  getNotifications: notImplemented(
    "Notification listing endpoint is not implemented yet.",
  ),
  createNotification: notImplemented(
    "Notification creation endpoint is not implemented yet.",
  ),
  markNotificationRead: notImplemented(
    "Notification read endpoint is not implemented yet.",
  ),
  deleteNotification: notImplemented(
    "Notification delete endpoint is not implemented yet.",
  ),
};
