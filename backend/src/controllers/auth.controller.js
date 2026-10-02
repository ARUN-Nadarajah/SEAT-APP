const { asyncHandler } = require("../utils/errors");
const {
  requestRegisterOtp,
  verifyRegisterOtp,
  loginWithPassword,
  requestPasswordResetOtp,
  verifyPasswordResetOtp,
  getAuthenticatedProfile,
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

module.exports = {
  register,
  verifyRegistration,
  login,
  requestPasswordReset,
  verifyPasswordReset,
  logout,
  getProfile,
};
