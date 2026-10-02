const express = require("express");
const cors = require("cors");

const { AppError } = require("./utils/errors");

const routes = require("./routes");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "seat-app-backend",
  });
});

app.use("/api", routes);

app.use((err, req, res, next) => {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message =
    err instanceof AppError ? err.message : "Internal Server Error";

  console.error(err);
  res.status(statusCode).json({
    status: "error",
    message,
    code: err.code || "internal_error",
    details: err.details,
  });
});

module.exports = app;
