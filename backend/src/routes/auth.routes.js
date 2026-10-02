const express = require("express");

const {
  register,
  verifyRegistration,
  login,
  requestPasswordReset,
  verifyPasswordReset,
  logout,
  getProfile,
} = require("../controllers/auth.controller");

const router = express.Router();

router.post("/register/request-otp", register);
router.post("/register/verify-otp", verifyRegistration);
router.post("/login", login);
router.post("/password/request-otp", requestPasswordReset);
router.post("/password/verify-otp", verifyPasswordReset);
router.post("/logout", logout);
router.get("/profile", ...getProfile);

module.exports = router;
