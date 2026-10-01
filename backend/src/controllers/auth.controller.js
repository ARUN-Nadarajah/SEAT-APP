const notImplemented = (message) => (req, res) => {
  res.status(200).json({
    message,
    status: "not_implemented",
  });
};

module.exports = {
  register: notImplemented("Auth register endpoint is not implemented yet."),
  login: notImplemented("Auth login endpoint is not implemented yet."),
  logout: notImplemented("Auth logout endpoint is not implemented yet."),
  getProfile: notImplemented("Auth profile endpoint is not implemented yet."),
};
