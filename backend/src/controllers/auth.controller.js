const { asyncHandler } = require("../utils/errors");
const {
  requestRegisterOtp,
  verifyRegisterOtp,
  loginWithPassword,
  refreshSession,
  requestPasswordResetOtp,
  verifyPasswordResetOtp,
  getAuthenticatedProfile,
  updateAuthenticatedProfile,
} = require("../services/auth.service");
const { authenticate } = require("../middleware/auth.middleware");

const register = asyncHandler(async (req, res) => {
  const result = await requestRegisterOtp(req.body);
  res.status(200).json({ status: "success", ...result });
});

const verifyRegistration = asyncHandler(async (req, res) => {
  const result = await verifyRegisterOtp(req.body);
  res.status(200).json({ status: "success", ...result });
});

const login = asyncHandler(async (req, res) => {
  const result = await loginWithPassword(req.body);
  res.status(200).json({ status: "success", ...result });
});

/** POST /api/auth/refresh — rotate an expired access token (spec §7). */
const refresh = asyncHandler(async (req, res) => {
  const result = await refreshSession(req.body.refreshToken);
  res.status(200).json({ status: "success", ...result });
});

const requestPasswordReset = asyncHandler(async (req, res) => {
  const result = await requestPasswordResetOtp(req.body);
  res.status(200).json({ status: "success", ...result });
});

const verifyPasswordReset = asyncHandler(async (req, res) => {
  const result = await verifyPasswordResetOtp(req.body);
  res.status(200).json({ status: "success", ...result });
});

const logout = asyncHandler(async (req, res) => {
  res.status(200).json({
    status: "success",
    message: "Logged out successfully.",
  });
});

const getProfile = [
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await getAuthenticatedProfile(req.user._id);
    res.status(200).json({ status: "success", ...result });
  }),
];

/** GET /api/auth/me — alias of the profile endpoint (spec §7). */
const getMe = getProfile;

/** PATCH /api/auth/me — profile edits + notification preferences. */
const updateProfile = [
  authenticate,
  asyncHandler(async (req, res) => {
    const result = await updateAuthenticatedProfile(req.user._id, req.body);
    res.status(200).json({ status: "success", ...result });
  }),
];

module.exports = {
  register,
  verifyRegistration,
  login,
  refresh,
  requestPasswordReset,
  verifyPasswordReset,
  logout,
  getProfile,
  getMe,
  updateProfile,
};
