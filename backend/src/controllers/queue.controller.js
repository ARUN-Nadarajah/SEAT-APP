const notImplemented = (message) => (req, res) => {
  res.status(200).json({
    message,
    status: "not_implemented",
  });
};

module.exports = {
  getQueue: notImplemented("Queue listing endpoint is not implemented yet."),
  addToQueue: notImplemented("Queue add endpoint is not implemented yet."),
  updateQueueStatus: notImplemented(
    "Queue status update endpoint is not implemented yet.",
  ),
  removeFromQueue: notImplemented(
    "Queue removal endpoint is not implemented yet.",
  ),
};
