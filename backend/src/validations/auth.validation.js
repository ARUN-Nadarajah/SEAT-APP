const { AppError } = require("../utils/errors");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function assertEmail(email, fieldName = "email") {
  const value = normalizeEmail(email);

  if (!value || !emailPattern.test(value)) {
    throw new AppError(
      `A valid ${fieldName} is required.`,
      400,
      "validation_error",
    );
  }

  return value;
}

function assertPassword(password) {
  const value = String(password || "");

  if (value.length < 8) {
    throw new AppError(
      "Password must be at least 8 characters long.",
      400,
      "validation_error",
    );
  }

  return value;
}

function assertName(name) {
  const value = String(name || "").trim();

  if (value.length < 3) {
    throw new AppError(
      "Full name must be at least 3 characters long.",
      400,
      "validation_error",
    );
  }

  return value;
}

function assertPhone(phone) {
  const value = String(phone || "").trim();
  const digits = value.replace(/\D/g, "");

  if (digits.length < 10) {
    throw new AppError(
      "Phone number must contain at least 10 digits.",
      400,
      "validation_error",
    );
  }

  return value;
}

function assertOtp(otp) {
  const value = String(otp || "").trim();

  if (!/^\d{6}$/.test(value)) {
    throw new AppError("OTP must be a 6-digit code.", 400, "validation_error");
  }

  return value;
}

const ROLES = ["customer", "staff", "manager"];

function assertRole(role) {
  const value = String(role || "customer").trim().toLowerCase();

  if (!ROLES.includes(value)) {
    throw new AppError(
      "Please choose a valid account role.",
      400,
      "validation_error",
    );
  }

  return value;
}

function validateRegisterRequest(payload) {
  return {
    fullName: assertName(payload.fullName),
    email: assertEmail(payload.email),
    phone: assertPhone(payload.phone),
    password: assertPassword(payload.password),
    // Spec §5: the Register screen offers "role selection for demo".
    role: assertRole(payload.role),
  };
}

function validateLoginRequest(payload) {
  return {
    email: assertEmail(payload.email),
    password: assertPassword(payload.password),
  };
}

function validateEmailOnlyRequest(payload) {
  return {
    email: assertEmail(payload.email),
  };
}

function validateOtpRequest(payload) {
  return {
    email: assertEmail(payload.email),
    otp: assertOtp(payload.otp),
  };
}

function validateResetPasswordRequest(payload) {
  return {
    email: assertEmail(payload.email),
    otp: assertOtp(payload.otp),
    newPassword: assertPassword(payload.newPassword),
  };
}

module.exports = {
  normalizeEmail,
  assertEmail,
  assertPassword,
  assertName,
  assertPhone,
  assertOtp,
  assertRole,
  ROLES,
  validateRegisterRequest,
  validateLoginRequest,
  validateEmailOnlyRequest,
  validateOtpRequest,
  validateResetPasswordRequest,
};
