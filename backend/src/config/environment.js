require("dotenv").config();

module.exports = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || "development",
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/seat-app",
  JWT_SECRET: process.env.JWT_SECRET || "seat-app-dev-secret",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  OTP_SECRET: process.env.OTP_SECRET || "seat-app-otp-secret",
  OTP_EXPIRES_MINUTES: Number.parseInt(
    process.env.OTP_EXPIRES_MINUTES || "10",
    10,
  ),
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: Number.parseInt(process.env.SMTP_PORT || "587", 10),
  SMTP_SECURE: process.env.SMTP_SECURE === "true",
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
  EMAIL_FROM: process.env.EMAIL_FROM || "Seat App <no-reply@seat-app.local>",
};
