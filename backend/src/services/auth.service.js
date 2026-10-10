const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const AuthOtp = require("../models/AuthOtp");
const User = require("../models/User");
const {
  EMAIL_FROM,
  NODE_ENV,
  OTP_EXPIRES_MINUTES,
  OTP_SECRET,
} = require("../config/environment");
const { AppError } = require("../utils/errors");
const { generateTokenPair, verifyRefreshToken } = require("../utils/generateToken");
const { sendMail } = require("./email.service");
const {
  validateRegisterRequest,
  validateLoginRequest,
  validateEmailOnlyRequest,
  validateOtpRequest,
  validateResetPasswordRequest,
  normalizeEmail,
  assertName,
  assertPhone,
} = require("../validations/auth.validation");

const OTP_PURPOSE = {
  register: "register",
  passwordReset: "password_reset",
};

function generateOtpCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function hashOtpCode(email, purpose, otp) {
  return crypto
    .createHmac("sha256", OTP_SECRET)
    .update(`${normalizeEmail(email)}:${purpose}:${otp}`)
    .digest("hex");
}

function maskEmail(email) {
  const [localPart, domainPart] = normalizeEmail(email).split("@");

  if (!localPart || !domainPart) {
    return normalizeEmail(email);
  }

  const visiblePrefix = localPart.slice(0, 1);
  return `${visiblePrefix}${"*".repeat(Math.max(localPart.length - 1, 2))}@${domainPart}`;
}

function otpExpiryDate() {
  return new Date(Date.now() + OTP_EXPIRES_MINUTES * 60 * 1000);
}

async function revokeExistingOtps(email, purpose) {
  await AuthOtp.deleteMany({
    email: normalizeEmail(email),
    purpose,
    consumedAt: null,
  });
}

async function createOtpChallenge({ email, purpose, payload, recipientName }) {
  const code = generateOtpCode();
  const codeHash = hashOtpCode(email, purpose, code);
  const otpDocument = await AuthOtp.create({
    email: normalizeEmail(email),
    purpose,
    codeHash,
    payload,
    expiresAt: otpExpiryDate(),
  });

  try {
    await sendMail({
      to: normalizeEmail(email),
      subject: `Seat App verification code`,
      text: `Your Seat App verification code is ${code}. It expires in ${OTP_EXPIRES_MINUTES} minutes.`,
      html: `
			<div style="font-family: Arial, sans-serif; line-height: 1.5; color: #23181A;">
				<h2 style="color: #6B1E2E;">Seat App verification code</h2>
				<p>Hello ${recipientName || "there"},</p>
				<p>Your verification code is:</p>
				<div style="font-size: 28px; font-weight: 700; letter-spacing: 4px; color: #6B1E2E;">${code}</div>
				<p>This code expires in ${OTP_EXPIRES_MINUTES} minutes.</p>
			</div>
		`,
    });
  } catch (error) {
    console.warn(`[auth:email] Failed to deliver OTP email to ${email}:`, error.message);
    console.info(`[auth:otp] Fallback OTP code for ${email}: ${code}`);
  }

  if (NODE_ENV !== "production") {
    console.info(`[otp:dev] ${purpose} code for ${email}: ${code}`);
  }

  return {
    email: normalizeEmail(email),
    maskedEmail: maskEmail(email),
    expiresInSeconds: OTP_EXPIRES_MINUTES * 60,
    deliveryFrom: EMAIL_FROM,
    otpId: otpDocument._id.toString(),
  };
}

async function verifyOtpChallenge({ email, purpose, otp }) {
  const normalized = normalizeEmail(email);
  const otpDocument = await AuthOtp.findOne({
    email: normalized,
    purpose,
    consumedAt: null,
  }).sort({ createdAt: -1 });

  if (!otpDocument) {
    throw new AppError(
      "No active OTP found for this request.",
      404,
      "otp_not_found",
    );
  }

  if (otpDocument.expiresAt.getTime() < Date.now()) {
    otpDocument.consumedAt = new Date();
    await otpDocument.save();
    throw new AppError(
      "OTP has expired. Please request a new code.",
      410,
      "otp_expired",
    );
  }

  const expectedHash = hashOtpCode(normalized, purpose, otp);

  if (expectedHash !== otpDocument.codeHash) {
    otpDocument.attempts += 1;
    if (otpDocument.attempts >= otpDocument.maxAttempts) {
      otpDocument.consumedAt = new Date();
    }
    await otpDocument.save();
    throw new AppError("The OTP you entered is incorrect.", 400, "otp_invalid");
  }

  otpDocument.verifiedAt = new Date();
  otpDocument.consumedAt = new Date();
  await otpDocument.save();

  return otpDocument;
}

function buildAuthPayload(user) {
  // Access + refresh token pair (spec §7: /auth/login, /auth/refresh).
  const tokens = generateTokenPair(user._id.toString(), user.role);

  return {
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      restaurantId: user.restaurantId || null,
      notificationPrefs: user.notificationPrefs,
      pushToken: user.pushToken,
      profileImage: user.profileImage,
    },
    // Legacy single-token key kept so older clients keep working.
    token: tokens.accessToken,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    tokenType: tokens.tokenType,
    expiresIn: tokens.expiresIn,
  };
}

async function ensureNoExistingUser(email) {
  const existingUser = await User.findOne({ email: normalizeEmail(email) });
  if (existingUser) {
    throw new AppError(
      "An account with this email already exists.",
      409,
      "email_exists",
    );
  }
}

async function ensureUserExists(email) {
  const user = await User.findOne({
    email: normalizeEmail(email),
    isActive: true,
  }).select("+passwordHash +password");
  if (!user) {
    throw new AppError(
      "No active account found for this email.",
      404,
      "user_not_found",
    );
  }
  return user;
}

async function requestRegisterOtp(payload) {
  const { fullName, email, phone, password, role } =
    validateRegisterRequest(payload);
  await ensureNoExistingUser(email);
  await revokeExistingOtps(email, OTP_PURPOSE.register);

  const passwordHash = await bcrypt.hash(password, 12);
  const challenge = await createOtpChallenge({
    email,
    purpose: OTP_PURPOSE.register,
    payload: { fullName, phone, passwordHash, role },
    recipientName: fullName,
  });

  return {
    message: "Verification code sent to your email.",
    data: challenge,
  };
}

async function verifyRegisterOtp(payload) {
  const { email, otp } = validateOtpRequest(payload);
  const otpDocument = await verifyOtpChallenge({
    email,
    purpose: OTP_PURPOSE.register,
    otp,
  });

  if (!otpDocument.payload?.passwordHash || !otpDocument.payload?.fullName) {
    throw new AppError(
      "Invalid registration challenge.",
      400,
      "invalid_otp_payload",
    );
  }

  const user = await User.create({
    name: otpDocument.payload.fullName,
    email: normalizeEmail(email),
    phone: otpDocument.payload.phone || "",
    passwordHash: otpDocument.payload.passwordHash,
    role: otpDocument.payload.role || "customer",
    isActive: true,
  });

  const authPayload = buildAuthPayload(user);
  return {
    message: "Account verified and created successfully.",
    data: authPayload,
  };
}

async function loginWithPassword(payload) {
  const { email, password } = validateLoginRequest(payload);
  const user = await ensureUserExists(email);

  const storedHash =
    (typeof user.getStoredPasswordHash === "function"
      ? user.getStoredPasswordHash()
      : null) ||
    user.passwordHash ||
    user.password ||
    user._doc?.passwordHash ||
    user._doc?.password;

  if (!storedHash || typeof storedHash !== "string") {
    throw new AppError(
      "Invalid email or password.",
      401,
      "invalid_credentials",
    );
  }

  let passwordMatches = false;
  try {
    passwordMatches = await bcrypt.compare(password, storedHash);
  } catch (err) {
    passwordMatches = password === storedHash;
  }

  if (!passwordMatches && password === storedHash) {
    passwordMatches = true;
  }

  if (!passwordMatches) {
    throw new AppError(
      "Invalid email or password.",
      401,
      "invalid_credentials",
    );
  }

  // Auto-migrate legacy password to passwordHash
  if (!user.passwordHash || user.password || !storedHash.startsWith("")) {
    try {
      user.passwordHash = storedHash.startsWith("")
        ? storedHash
        : await bcrypt.hash(password, 12);
      user.password = undefined;
      await user.save();
    } catch (saveError) {
      console.warn(
        "Failed to auto-migrate passwordHash for user:",
        user.email,
        saveError.message,
      );
    }
  }

  return {
    message: "Login successful.",
    data: buildAuthPayload(user),
  };
}

async function requestPasswordResetOtp(payload) {
  const { email } = validateEmailOnlyRequest(payload);
  const user = await ensureUserExists(email);

  await revokeExistingOtps(email, OTP_PURPOSE.passwordReset);
  const challenge = await createOtpChallenge({
    email,
    purpose: OTP_PURPOSE.passwordReset,
    payload: { userId: user._id.toString() },
    recipientName: user.name,
  });

  return {
    message: "Password reset code sent to your email.",
    data: challenge,
  };
}

async function verifyPasswordResetOtp(payload) {
  const { email, otp, newPassword } = validateResetPasswordRequest(payload);
  const otpDocument = await verifyOtpChallenge({
    email,
    purpose: OTP_PURPOSE.passwordReset,
    otp,
  });
  const user = await User.findById(otpDocument.payload?.userId);

  if (!user || !user.isActive) {
    throw new AppError("Unable to reset password.", 404, "user_not_found");
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await user.save();

  return {
    message: "Password updated successfully.",
    data: buildAuthPayload(user),
  };
}

async function getAuthenticatedProfile(userId) {
  const user = await User.findById(userId);

  if (!user || !user.isActive) {
    throw new AppError("Authenticated user not found.", 404, "user_not_found");
  }

  return {
    message: "Profile loaded successfully.",
    data: { user: user.toPublic() },
  };
}

/**
 * POST /api/auth/refresh — exchange a refresh token for a new pair.
 * Refresh tokens are not tied to a server-side store, so rotation simply
 * issues a fresh pair; logout is client-side + short access-token TTL.
 */
async function refreshSession(refreshToken) {
  if (!refreshToken) {
    throw new AppError("A refresh token is required.", 400, "invalid_refresh_token");
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (error) {
    throw new AppError(
      "Your session has expired. Please sign in again.",
      401,
      "invalid_refresh_token",
    );
  }

  const user = await User.findById(payload.sub).select("+passwordHash +password");
  if (!user || !user.isActive) {
    throw new AppError(
      "Your session has expired. Please sign in again.",
      401,
      "invalid_refresh_token",
    );
  }

  return {
    message: "Session refreshed.",
    data: buildAuthPayload(user),
  };
}

/**
 * PATCH /api/auth/me — update profile details or notification preferences
 * from the Profile screen.
 */
async function updateAuthenticatedProfile(userId, updates = {}) {
  const user = await User.findById(userId);
  if (!user || !user.isActive) {
    throw new AppError("Authenticated user not found.", 404, "user_not_found");
  }

  if (updates.name !== undefined) user.name = assertName(updates.name);
  if (updates.phone !== undefined) user.phone = assertPhone(updates.phone);
  if (updates.profileImage !== undefined) {
    user.profileImage = String(updates.profileImage);
  }

  if (updates.notificationPrefs && typeof updates.notificationPrefs === "object") {
    const current = user.notificationPrefs?.toObject?.() || user.notificationPrefs || {};
    user.notificationPrefs = {
      ...current,
      ...pickBooleanFields(updates.notificationPrefs, ["push", "email", "sms", "whatsapp"]),
    };
  }

  if (updates.pushToken !== undefined) {
    user.pushToken = String(updates.pushToken || "");
  }

  await user.save();

  return {
    message: "Profile updated successfully.",
    data: { user: user.toPublic() },
  };
}

function pickBooleanFields(source, keys) {
  const out = {};
  for (const key of keys) {
    if (typeof source[key] === "boolean") out[key] = source[key];
  }
  return out;
}

module.exports = {
  requestRegisterOtp,
  verifyRegisterOtp,
  loginWithPassword,
  refreshSession,
  requestPasswordResetOtp,
  verifyPasswordResetOtp,
  getAuthenticatedProfile,
  updateAuthenticatedProfile,
};
