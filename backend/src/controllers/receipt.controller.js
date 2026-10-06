const { asyncHandler } = require("../utils/errors");
const { success } = require("../utils/response");
const { assertObjectId } = require("../middleware/validation.middleware");
const receiptService = require("../services/receipt.service");

/**
 * GET /api/reservations/:id/receipt — Retrieve latest receipt (and versions) for a reservation.
 */
const getReservationReceipt = asyncHandler(async (req, res) => {
  const reservationId = assertObjectId(req.params.id, "reservationId");
  const result = await receiptService.getLatestReceipt(reservationId, req.user);
  success(res, { data: result });
});

/**
 * GET /api/receipts/:id — Retrieve a specific receipt snapshot by ID or receiptNumber.
 */
const getReceiptById = asyncHandler(async (req, res) => {
  const idOrNumber = req.params.id;
  const result = await receiptService.getReceiptById(idOrNumber, req.user);
  success(res, { data: result });
});

module.exports = {
  getReservationReceipt,
  getReceiptById,
};

