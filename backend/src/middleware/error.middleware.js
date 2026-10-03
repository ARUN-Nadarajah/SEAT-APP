const { AppError } = require("../utils/errors");

/**
 * 404 handler for unknown API routes. Mount after all routers.
 */
function notFound(req, res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, "not_found"));
}

/**
 * Central error handler (spec NFR05 — consistent error responses).
 *
 * AppError carries an intentional status + code; anything else is treated
 * as an unexpected 500 and logged, but never leaks stack traces to clients.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Mongoose duplicate key (e.g. email already registered).
  if (err && err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    return res.status(409).json({
      status: "error",
      message: `That ${field} is already in use.`,
      code: "duplicate_key",
    });
  }

  // Mongoose validation errors.
  if (err && err.name === "ValidationError") {
    const details = Object.fromEntries(
      Object.entries(err.errors || {}).map(([k, v]) => [k, v.message]),
    );
    return res.status(400).json({
      status: "error",
      message: "Please check the highlighted fields.",
      code: "validation_error",
      details,
    });
  }

  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const message = isAppError ? err.message : "Internal Server Error";
  const code = isAppError ? err.code : "internal_error";

  if (!isAppError) {
    console.error(err);
  }

  return res.status(statusCode).json({
    status: "error",
    message,
    code,
    ...(err.details !== undefined ? { details: err.details } : {}),
  });
}

module.exports = { notFound, errorHandler };
