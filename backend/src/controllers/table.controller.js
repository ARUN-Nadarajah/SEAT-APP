const notImplemented = (message) => (req, res) => {
  res.status(200).json({
    message,
    status: "not_implemented",
  });
};

module.exports = {
  getTables: notImplemented("Table listing endpoint is not implemented yet."),
  createTable: notImplemented(
    "Table creation endpoint is not implemented yet.",
  ),
  getTableById: notImplemented("Table detail endpoint is not implemented yet."),
  updateTable: notImplemented("Table update endpoint is not implemented yet."),
  deleteTable: notImplemented("Table delete endpoint is not implemented yet."),
};
