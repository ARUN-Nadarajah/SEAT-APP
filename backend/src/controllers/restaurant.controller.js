const notImplemented = (message) => (req, res) => {
  res.status(200).json({
    message,
    status: "not_implemented",
  });
};

module.exports = {
  getRestaurants: notImplemented(
    "Restaurant listing endpoint is not implemented yet.",
  ),
  createRestaurant: notImplemented(
    "Restaurant creation endpoint is not implemented yet.",
  ),
  getRestaurantById: notImplemented(
    "Restaurant detail endpoint is not implemented yet.",
  ),
  updateRestaurant: notImplemented(
    "Restaurant update endpoint is not implemented yet.",
  ),
  deleteRestaurant: notImplemented(
    "Restaurant delete endpoint is not implemented yet.",
  ),
};
