const notImplemented = (message) => (req, res) => {
  res.status(200).json({
    message,
    status: "not_implemented",
  });
};

module.exports = {
  getFoods: notImplemented("Food listing endpoint is not implemented yet."),
  createFood: notImplemented("Food creation endpoint is not implemented yet."),
  getFoodById: notImplemented("Food detail endpoint is not implemented yet."),
  updateFood: notImplemented("Food update endpoint is not implemented yet."),
  deleteFood: notImplemented("Food delete endpoint is not implemented yet."),
};
