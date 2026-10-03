require("dotenv").config();

const env = (key, fallback) => {
  const value = process.env[key];
  // Treat "" the same as unset so an empty .env value can't break config.
  return value === undefined || value === null || value === "" ? fallback : value;
};

/** Parse an env var as a positive integer, else fall back. */
const intEnv = (key, fallback) => {
  const parsed = Number.parseInt(process.env[key], 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

module.exports = {
  // Never trust an empty or non-numeric PORT (some shells export PORT=0).
  PORT: intEnv("PORT", 5000),
  NODE_ENV: env("NODE_ENV", "development"),
  MONGODB_URI: env("MONGODB_URI", "mongodb://127.0.0.1:27017/seat-app"),

  // --- Auth (spec §7: JWT access + refresh) ---
  JWT_SECRET: env("JWT_SECRET", "seat-app-dev-secret"),
  JWT_EXPIRES_IN: env("JWT_EXPIRES_IN", "15m"),
  JWT_REFRESH_SECRET: env("JWT_REFRESH_SECRET", "seat-app-dev-refresh-secret"),
  JWT_REFRESH_EXPIRES_IN: env("JWT_REFRESH_EXPIRES_IN", "30d"),

  // --- Password reset OTP ---
  OTP_SECRET: env("OTP_SECRET", "seat-app-otp-secret"),
  OTP_EXPIRES_MINUTES: Number.parseInt(env("OTP_EXPIRES_MINUTES", "10"), 10),

  // --- Rate limiting (spec §1 / NFR04) ---
  RATE_LIMIT_WINDOW_MS: intEnv("RATE_LIMIT_WINDOW_MS", 900000),
  RATE_LIMIT_MAX: intEnv("RATE_LIMIT_MAX", 300),
  AUTH_RATE_LIMIT_MAX: intEnv("AUTH_RATE_LIMIT_MAX", 20),

  // --- CORS ---
  CORS_ORIGIN: env("CORS_ORIGIN", "*"),

  // --- Email (nodemailer; logs to console when unconfigured) ---
  SMTP_HOST: env("SMTP_HOST", ""),
  SMTP_PORT: intEnv("SMTP_PORT", 587),
  SMTP_SECURE: env("SMTP_SECURE", "false") === "true",
  SMTP_USER: env("SMTP_USER", ""),
  SMTP_PASS: env("SMTP_PASS", ""),
  EMAIL_FROM: env("EMAIL_FROM", "SEAT App <no-reply@seat-app.local>"),

  // --- Push notifications (Expo) ---
  EXPO_PUSH_ACCESS_TOKEN: env("EXPO_PUSH_ACCESS_TOKEN", ""),

  isProduction: env("NODE_ENV", "development") === "production",
};
