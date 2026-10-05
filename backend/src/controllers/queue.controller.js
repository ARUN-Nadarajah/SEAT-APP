const { asyncHandler } = require("../utils/errors");
const { success } = require("../utils/response");
const { validateBody, validateQuery, assertObjectId } =
  require("../middleware/validation.middleware");
const queueService = require("../services/queue.service");
const {
  validateJoinQueue,
  validateRestaurantScope,
  validateRemoveReason,
} = require("../validations/queue.validation");

/**
 * Virtual queue (spec §7 / FR03–FR06, FR09).
 *
 * Customer endpoints are authenticated; staff endpoints additionally
 * require the `staff`/`manager` role, enforced by `requireRole`.
 */

/** POST /api/queue/preview — wait estimate before joining (FR04). */
const getPreview = asyncHandler(async (req, res) => {
  const { restaurantId } = validateRestaurantScope({}, req.query);
  const result = await queueService.getQueuePreview(
    restaurantId,
    req.query.partySize,
  );
  success(res, result);
});

/** POST /api/queue/join — join the virtual queue (FR03). */
const addToQueue = [
  validateBody(validateJoinQueue),
  asyncHandler(async (req, res) => {
    const result = await queueService.joinQueue(req.user._id, req.body);
    success(res, result, 201);
  }),
];

/** GET /api/queue/mine — my active entry (FR04/FR05). */
const getMyEntry = asyncHandler(async (req, res) => {
  const restaurantId = req.query.restaurantId
    ? assertObjectId(req.query.restaurantId, "restaurantId")
    : null;
  const result = await queueService.getMyActiveEntry(req.user._id, restaurantId);
  success(res, result);
});

/** GET /api/queue — staff view of the live queue (FR09). */
const getQueue = asyncHandler(async (req, res) => {
  const { restaurantId } = validateRestaurantScope({}, req.query);
  const result = await queueService.listQueue(restaurantId);
  success(res, result);
});

/** DELETE /api/queue/:id — leave the queue (customer). */
const removeFromQueue = asyncHandler(async (req, res) => {
  const id = assertObjectId(req.params.id, "entryId");
  const result = await queueService.leaveQueue(req.user._id, id);
  success(res, result);
});

/** POST /api/queue/staff/call-next — promote the next party (FR09). */
const callNext = asyncHandler(async (req, res) => {
  const { restaurantId } = validateRestaurantScope(req.body || {}, req.query);
  const result = await queueService.callNext(restaurantId);
  success(res, result);
});

/** POST /api/queue/staff/:id/notify — re-send "table is ready" (FR06). */
const notifyReady = asyncHandler(async (req, res) => {
  const { restaurantId } = validateRestaurantScope(req.body || {}, req.query);
  const entryId = assertObjectId(req.params.id, "entryId");
  const result = await queueService.notifyReady(restaurantId, entryId);
  success(res, result);
});

/** POST /api/queue/staff/:id/seat — seat the party (FR09). */
const seat = asyncHandler(async (req, res) => {
  const { restaurantId } = validateRestaurantScope(req.body || {}, req.query);
  const entryId = assertObjectId(req.params.id, "entryId");
  const result = await queueService.seatParty(restaurantId, entryId);
  success(res, result);
});

/** POST /api/queue/staff/:id/remove — no-show / remove (FR09). */
const remove = asyncHandler(async (req, res) => {
  const { restaurantId } = validateRestaurantScope(req.body || {}, req.query);
  const entryId = assertObjectId(req.params.id, "entryId");
  const { reason } = validateRemoveReason(req.body || {});
  const result = await queueService.removeFromQueue(restaurantId, entryId, reason);
  success(res, result);
});

/** POST /api/queue/staff/:id/preparing — mark parcel as preparing (Sobiyan). */
const markPreparing = asyncHandler(async (req, res) => {
  const { restaurantId } = validateRestaurantScope(req.body || {}, req.query);
  const entryId = assertObjectId(req.params.id, "entryId");
  const result = await queueService.markPreparing(restaurantId, entryId);
  success(res, result);
});

/** POST /api/queue/staff/:id/ready — mark parcel ready & alert customer (Sobiyan). */
const markReady = asyncHandler(async (req, res) => {
  const { restaurantId } = validateRestaurantScope(req.body || {}, req.query);
  const entryId = assertObjectId(req.params.id, "entryId");
  const result = await queueService.markReady(restaurantId, entryId);
  success(res, result);
});

/** POST /api/queue/staff/:id/collect — mark parcel collected (Sobiyan). */
const markCollected = asyncHandler(async (req, res) => {
  const { restaurantId } = validateRestaurantScope(req.body || {}, req.query);
  const entryId = assertObjectId(req.params.id, "entryId");
  const result = await queueService.markCollected(restaurantId, entryId);
  success(res, result);
});

module.exports = {
  getPreview,
  addToQueue,
  getMyEntry,
  getQueue,
  removeFromQueue,
  callNext,
  notifyReady,
  seat,
  remove,
  markPreparing,
  markReady,
  markCollected,
};
