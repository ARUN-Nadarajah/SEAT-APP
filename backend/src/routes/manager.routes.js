const express = require("express");

const { getStats, getDaily } = require("../controllers/manager.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");

const router = express.Router();

// Manager/Owner only (spec §2 / FR10).
router.use(authenticate, requireRole("manager"));

router.get("/stats", getStats);
router.get("/daily", getDaily);

module.exports = router;
