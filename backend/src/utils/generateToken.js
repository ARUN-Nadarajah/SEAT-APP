const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const {
  JWT_SECRET,
  JWT_EXPIRES_IN,
  JWT_REFRESH_SECRET,
  JWT_REFRESH_EXPIRES_IN,
} = require("../config/environment");

/**
 * Short-lived access token (default 15 minutes).
 * Carries `sub` (user id) + `role` for role-based access control (spec §2).
 */
function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/**
 * Long-lived refresh token (default 30 days) used by `/auth/refresh`.
 * Only the user id is embedded — no roles, so a leaked refresh token
 * cannot be replayed as an access token.
 */
function generateRefreshToken(userId) {
  // `jti` guarantees two refresh tokens are never identical, so an issued
  // token is always distinguishable from the one it replaced (rotation).
  return jwt.sign(
    {
      sub: String(userId),
      type: "refresh",
      jti: crypto.randomUUID(),
    },
    JWT_REFRESH_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN },
  );
}

function verifyRefreshToken(token) {
  const payload = jwt.verify(token, JWT_REFRESH_SECRET);
  if (payload.type !== "refresh") {
    throw new Error("Token is not a refresh token.");
  }
  return payload;
}

/** Convenience: full token pair returned by login/register. */
function generateTokenPair(userId, role) {
  return {
    accessToken: generateToken({ sub: String(userId), role }),
    refreshToken: generateRefreshToken(userId),
    tokenType: "Bearer",
    expiresIn: JWT_EXPIRES_IN,
  };
}

module.exports = {
  generateToken,
  verifyToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateTokenPair,
};
