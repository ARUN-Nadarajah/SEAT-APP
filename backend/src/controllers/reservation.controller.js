const notImplemented = (message) => (req, res) => {
  res.status(200).json({
    message,
    status: "not_implemented",
  });
};

module.exports = {
  getReservations: notImplemented(
    "Reservation listing endpoint is not implemented yet.",
  ),
  createReservation: notImplemented(
    "Reservation creation endpoint is not implemented yet.",
  ),
  getReservationById: notImplemented(
    "Reservation detail endpoint is not implemented yet.",
  ),
  updateReservation: notImplemented(
    "Reservation update endpoint is not implemented yet.",
  ),
  cancelReservation: notImplemented(
    "Reservation cancel endpoint is not implemented yet.",
  ),
};
