const notImplemented = (message) => (req, res) => {
  res.status(200).json({
    message,
    status: "not_implemented",
  });
};

module.exports = {
  getUsers: notImplemented("User listing endpoint is not implemented yet."),
  createUser: notImplemented("User creation endpoint is not implemented yet."),
  getUserById: notImplemented("User detail endpoint is not implemented yet."),
  updateUser: notImplemented("User update endpoint is not implemented yet."),
  deleteUser: notImplemented("User delete endpoint is not implemented yet."),
};
