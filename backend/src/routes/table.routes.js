const express = require("express");

const {
  getTables,
  updateTableStatus,
  createTables,
} = require("../controllers/table.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");

const router = express.Router();

// Staff floor plan (FR08) and customer table browsing
router.get("/", getTables);

// Bulk (re)create — seed script and manager tooling.
router.post("/", authenticate, requireRole("staff", "manager"), createTables);

// FR08 — toggle Available / Occupied / Reserved.
router.patch("/:id/status", authenticate, requireRole("staff", "manager"), updateTableStatus);

module.exports = router;
