const express = require("express");

const {
  getTables,
  createTables,
  updateTable,
  updateTableStatus,
} = require("../controllers/table.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/role.middleware");

const router = express.Router();

router.use(authenticate, requireRole("staff", "manager"));

// Staff floor plan (FR08) — restaurant managers may also view.
router.get("/", getTables);

// Add a single table or bulk create via the seed script.
router.post("/", createTables);

// Edit table details (number, capacity, location, type, status).
router.patch("/:id", updateTable);

// FR08 — toggle Available / Occupied / Reserved.
router.patch("/:id/status", updateTableStatus);

module.exports = router;
