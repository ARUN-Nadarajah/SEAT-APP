const rateLimit = require("express-rate-limit");

const {
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX,
  AUTH_RATE_LIMIT_MAX,
  NODE_ENV,
} = require("../config/environment");

const message = {
  status: "error",
  message: "Too many requests. Please wait a moment and try again.",
  code: "rate_limited",
};

/**
 * General API limiter (spec §1: rate limiting).
 * Disabled under the test environment so Jest/Supertest runs don't trip it.
 */
const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  skip: () => NODE_ENV === "test",
  handler: (req, res) => res.status(429).json(message),
});

/**
 * Stricter limiter for auth endpoints (login / OTP request) to slow down
 * credential-stuffing and OTP spam (NFR04).
 */
const authLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  skip: () => NODE_ENV === "test",
  handler: (req, res) => res.status(429).json({
    ...message,
    message: "Too many attempts. Please wait a moment and try again.",
  }),
});

module.exports = { apiLimiter, authLimiter };
