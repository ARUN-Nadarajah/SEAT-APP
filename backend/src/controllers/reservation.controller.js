const { asyncHandler } = require("../utils/errors");
const { success } = require("../utils/response");
const { validateBody, validateQuery, validateParams, assertObjectId } =
  require("../middleware/validation.middleware");
const reservationService = require("../services/reservation.service");
const {
  validateCreateReservation,
  validateUpdateReservation,
} = require("../validations/reservation.validation");

/**
 * Reservations (spec §7 / FR02, FR07, FR09).
 */

/** GET /api/reservations — the caller's own bookings (Upcoming / Past). */
const getReservations = asyncHandler(async (req, res) => {
  const result = await reservationService.listMine(req.user._id, req.query);
  success(res, result);
});

/** POST /api/reservations — create a booking (FR02, single confirm call). */
const createReservation = [
  validateBody(validateCreateReservation),
  asyncHandler(async (req, res) => {
    const result = await reservationService.createReservation(req.user._id, req.body);
    success(res, result, 201);
  }),
];

/** GET /api/reservations/:id — booking detail (owner or staff). */
const getReservationById = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, "reservationId");
  const result = await reservationService.getReservationById(id, req.user);
  success(res, result);
});

/** PUT /api/reservations/:id — change reservation (FR07). */
const updateReservation = [
  validateBody(validateUpdateReservation),
  asyncHandler(async (req, res) => {
    const id = assertObjectId(req.params.id, "reservationId");
    const result = await reservationService.updateReservation(id, req.user, req.body);
    success(res, result);
  }),
];

/** DELETE /api/reservations/:id — cancel (FR07, app shows confirm dialog). */
const cancelReservation = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, "reservationId");
  const reason = String(req.body?.reason || "");
  const result = await reservationService.cancelReservation(id, req.user, reason);
  success(res, result);
});

/** GET /api/reservations/staff — today's list with search (FR09). */
const getStaffReservations = asyncHandler(async (req, res) => {
  const restaurantId = assertObjectId(
    req.query.restaurantId || req.user.restaurantId,
    "restaurantId",
  );
  const result = await reservationService.listForStaff({
    restaurantId,
    date: req.query.date,
    q: req.query.q || "",
    status: req.query.status || "",
  });
  success(res, result);
});

/** POST /api/reservations/:id/check-in — staff check-in (FR09). */
const checkIn = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, "reservationId");
  const restaurantId = req.user.restaurantId
    ? String(req.user.restaurantId)
    : req.body?.restaurantId;
  const result = await reservationService.checkIn(id, restaurantId);
  success(res, result);
});

/** POST /api/reservations/:id/no-show — staff no-show (FR09). */
const markNoShow = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, "reservationId");
  const restaurantId = req.user.restaurantId
    ? String(req.user.restaurantId)
    : req.body?.restaurantId;
  const result = await reservationService.markNoShow(id, restaurantId);
  success(res, result);
});

module.exports = {
  getReservations,
  createReservation,
  getReservationById,
  updateReservation,
  cancelReservation,
  getStaffReservations,
  checkIn,
  markNoShow,
};
