const express = require("express");
const { getReceiptById } = require("../controllers/receipt.controller");
const { authenticate } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authenticate);

// GET /api/receipts/:id — specific receipt version by ID or receiptNumber
router.get("/:id", getReceiptById);

module.exports = router;

