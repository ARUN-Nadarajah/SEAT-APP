const express = require("express");

const {
  getTables,
  createTable,
  getTableById,
  updateTable,
  deleteTable,
} = require("../controllers/table.controller");

const router = express.Router();

router.get("/", getTables);
router.post("/", createTable);
router.get("/:id", getTableById);
router.put("/:id", updateTable);
router.delete("/:id", deleteTable);

module.exports = router;
