const express = require("express");

const {
  getTables,
  updateTableStatus,
  createTables,
} = require("../controllers/table.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");

const router = express.Router();

router.use(authenticate, requireRole("staff", "manager"));

// Staff floor plan (FR08) — restaurant managers may also view.
router.get("/", getTables);

// Bulk (re)create — seed script and manager tooling.
router.post("/", createTables);

// FR08 — toggle Available / Occupied / Reserved.
router.patch("/:id/status", updateTableStatus);

module.exports = router;
