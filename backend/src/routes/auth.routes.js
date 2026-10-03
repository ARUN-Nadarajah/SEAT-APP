const express = require("express");

const {
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
} = require("../controllers/auth.controller");

const router = express.Router();

// --- Spec §7: Auth (register, login, refresh, logout, me) ---
router.post("/register/request-otp", register);
router.post("/register/verify-otp", verifyRegistration);
router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", logout);

// Profile (authenticated)
router.get("/profile", ...getProfile);
router.get("/me", ...getMe);
router.patch("/me", ...updateProfile);

// --- Password reset (OTP via email) ---
router.post("/password/request-otp", requestPasswordReset);
router.post("/password/verify-otp", verifyPasswordReset);

module.exports = router;
