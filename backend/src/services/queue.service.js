const QueueEntry = require("../models/QueueEntry");
const Restaurant = require("../models/Restaurant");
const User = require("../models/User");

const { AppError } = require("../utils/errors");
const { notify } = require("./notification.service");
const { emitQueueUpdated, emitQueueReady } = require("../realtime/events");

const ACTIVE_STATUSES = ["waiting", "preparing", "ready", "notified"];

async function normalizeLegacyEntry(entry) {
  if (entry?.status !== "notified") return entry;
  entry.status = "ready";
  entry.readyAt = entry.readyAt || new Date();
  await QueueEntry.updateOne(
    { _id: entry._id },
    { status: "ready", readyAt: entry.readyAt },
  );
  return entry;
}

function preparationMinutes(restaurant) {
  return restaurant?.averagePreparationMinutes || 15;
}

async function generateQueueCode() {
  const count = await QueueEntry.estimatedDocumentCount();
  let code = `Q-${String(count + 1).padStart(4, "0")}`;
  if (await QueueEntry.exists({ queueCode: code })) {
    code = `Q-${String(Math.floor(Math.random() * 9000) + 1000)}`;
  }
  return code;
}

async function activeEntries(restaurantId) {
  return QueueEntry.find({
    restaurantId,
    status: { $in: ACTIVE_STATUSES },
  })
    .sort({ joinedAt: 1 })
    .populate("userId", "name phone email")
    .lean();
}

async function recomputePositions(restaurantId) {
  const entries = await activeEntries(restaurantId);
  const restaurant = await Restaurant.findById(restaurantId).lean();
  const average = preparationMinutes(restaurant);

  return Promise.all(
    entries.map(async (entry, index) => {
      const position = index + 1;
      const ordersAhead = index;
      const estimatedWait = ordersAhead * average;
      await QueueEntry.updateOne(
        { _id: entry._id },
        { position, estimatedWait },
      );
      return {
        ...entry,
        position,
        ordersAhead,
        estimatedWait,
        estimateLabel: `${estimatedWait} min`,
      };
    }),
  );
}

function shapeStaffEntry(entry) {
  const user = entry.userId;
  return {
    id: entry._id,
    queueCode: entry.queueCode,
    parcelToken: entry.parcelToken || entry.queueCode,
    orderId: entry.orderId || null,
    orderSummary: entry.orderSummary || "",
    position: entry.position,
    ordersAhead: Math.max(0, (entry.position || 1) - 1),
    status: entry.status,
    estimatedWait: entry.estimatedWait,
    estimateLabel: `${entry.estimatedWait || 0} min`,
    guestName: entry.guestName || user?.name || "Guest",
    guestPhone: entry.guestPhone || user?.phone || "",
    joinedAt: entry.joinedAt,
    readyAt: entry.readyAt,
    collectedAt: entry.collectedAt,
  };
}

function shapeCustomerEntry(entry, restaurant, ordersAhead) {
  const stage =
    entry.status === "ready"
      ? "ready"
      : entry.status === "preparing"
        ? "preparing"
        : "joined";
  return {
    id: entry._id,
    queueCode: entry.queueCode,
    parcelToken: entry.parcelToken || entry.queueCode,
    orderId: entry.orderId || null,
    restaurantId: entry.restaurantId,
    restaurant: restaurant
      ? {
          id: restaurant._id,
          name: restaurant.name,
          address: restaurant.address,
          image: restaurant.images?.[0] || "",
        }
      : null,
    position: entry.position,
    ordersAhead,
    status: entry.status,
    stage,
    estimatedWait: entry.estimatedWait,
    estimateLabel: `${entry.estimatedWait || 0} min`,
    estimatedWaitLabel: `${entry.estimatedWait || 0} min`,
    guestName: entry.guestName,
    joinedAt: entry.joinedAt,
    readyAt: entry.readyAt,
    collectedAt: entry.collectedAt,
    lastUpdated: new Date().toISOString(),
  };
}

async function joinQueue(userId, payload) {
  const restaurant = await Restaurant.findById(payload.restaurantId).lean();
  if (!restaurant) throw new AppError("Restaurant not found.", 404, "not_found");
  if (!restaurant.isQueueEnabled) {
    throw new AppError("This restaurant is not running a takeaway queue right now.", 409, "queue_disabled");
  }

  const existing = await QueueEntry.findOne({
    userId,
    restaurantId: restaurant._id,
    status: { $in: ACTIVE_STATUSES },
  });
  if (existing) {
    throw new AppError("You are already in this queue.", 409, "already_in_queue", {
      queueCode: existing.queueCode,
      entryId: existing._id,
    });
  }

  const user = await User.findById(userId).lean();
  const entry = await QueueEntry.create({
    queueCode: await generateQueueCode(),
    userId,
    restaurantId: restaurant._id,
    orderId: payload.orderId || null,
    position: 1,
    status: "waiting",
    guestName: payload.guestName || user?.name || "",
    guestPhone: payload.guestPhone || user?.phone || "",
    orderSummary: payload.orderSummary || "",
  });
  const snapshot = await recomputePositions(restaurant._id);
  const current = snapshot.find((row) => String(row._id) === String(entry._id));
  const data = shapeCustomerEntry(current || entry.toObject(), restaurant, (current?.position || 1) - 1);

  emitQueueUpdated(restaurant._id, { queueLength: snapshot.length, entryId: entry._id });
  await notify({
    userId,
    type: "queue",
    title: "You're in the takeaway queue",
    body: `${restaurant.name}: your parcel is in the queue.`,
    route: "/queue",
    data: { queueCode: entry.queueCode },
    channel: "push",
  });
  return { message: "Your takeaway order is in the queue.", data };
}

async function getMyActiveEntry(userId, restaurantId = null) {
  const filter = { userId, status: { $in: ACTIVE_STATUSES } };
  if (restaurantId) filter.restaurantId = restaurantId;
  let entry = await QueueEntry.findOne(filter).sort({ joinedAt: -1 }).lean();
  if (!entry) return { data: null, lastUpdated: new Date().toISOString() };
  entry = await normalizeLegacyEntry(entry);
  const restaurant = await Restaurant.findById(entry.restaurantId).lean();
  const snapshot = await recomputePositions(entry.restaurantId);
  const current = snapshot.find((row) => String(row._id) === String(entry._id)) || entry;
  return {
    data: shapeCustomerEntry(current, restaurant, (current.position || 1) - 1),
    queueLength: snapshot.length,
    lastUpdated: new Date().toISOString(),
  };
}

async function leaveQueue(userId, entryId) {
  const entry = await QueueEntry.findOne({ _id: entryId, userId });
  if (!entry) throw new AppError("Queue entry not found.", 404, "not_found");
  if (entry.status !== "waiting") {
    throw new AppError("A takeaway order can only be removed while waiting.", 409, "queue_started");
  }
  entry.status = "cancelled";
  entry.leftAt = new Date();
  await entry.save();
  const snapshot = await recomputePositions(entry.restaurantId);
  emitQueueUpdated(entry.restaurantId, { queueLength: snapshot.length });
  return { message: "You have left the queue.", data: { id: entry._id, queueCode: entry.queueCode, status: entry.status } };
}

async function listQueue(restaurantId) {
  const entries = await recomputePositions(restaurantId);
  const data = (await Promise.all(entries.map(normalizeLegacyEntry))).map(shapeStaffEntry);
  return {
    data,
    total: data.length,
    waiting: data.filter((entry) => entry.status === "waiting").length,
    inQueue: data.filter((entry) => entry.status === "waiting").length,
    lastUpdated: new Date().toISOString(),
  };
}

async function findEntry(restaurantId, entryId) {
  const entry = await QueueEntry.findOne({ _id: entryId, restaurantId });
  if (!entry) throw new AppError("Queue entry not found.", 404, "not_found");
  return entry;
}

async function transition(restaurantId, entryId, from, to) {
  const entry = await findEntry(restaurantId, entryId);
  if (entry.status !== from) {
    throw new AppError(`Queue entry must be ${from}.`, 409, "invalid_queue_transition");
  }
  entry.status = to;
  if (to === "ready") entry.readyAt = new Date();
  if (to === "collected") entry.collectedAt = new Date();
  await entry.save();
  const snapshot = await recomputePositions(restaurantId);
  emitQueueUpdated(restaurantId, { queueLength: snapshot.length, entryId: entry._id, status: to });
  return { message: `Order marked as ${to}.`, data: shapeStaffEntry(entry) };
}

async function markPreparing(restaurantId, entryId) {
  return transition(restaurantId, entryId, "waiting", "preparing");
}

async function markReady(restaurantId, entryId) {
  const entryBefore = await findEntry(restaurantId, entryId);
  const result = await transition(
    restaurantId,
    entryId,
    entryBefore.status === "notified" ? "notified" : "preparing",
    "ready",
  );
  const entry = await findEntry(restaurantId, entryId);
  const restaurant = await Restaurant.findById(restaurantId).lean();
  await notify({
    userId: entry.userId,
    type: "queue-update",
    title: "Your order is ready for pickup!",
    body: `${restaurant?.name || "SEAT"}: collect parcel ${entry.queueCode} at the counter.`,
    route: "/queue/ready",
    data: { queueCode: entry.queueCode },
    channel: "push",
  });
  emitQueueReady(restaurantId, {
    entryId: entry._id,
    userId: String(entry.userId),
    queueCode: entry.queueCode,
    restaurantName: restaurant?.name || "",
  });
  return { ...result, message: "Customer notified that the order is ready." };
}

async function markCollected(restaurantId, entryId) {
  return transition(restaurantId, entryId, "ready", "collected");
}

async function removeFromQueue(restaurantId, entryId, reason = "no-show") {
  const entry = await findEntry(restaurantId, entryId);
  if (!ACTIVE_STATUSES.includes(entry.status)) {
    throw new AppError("Queue entry is no longer active.", 409, "queue_inactive");
  }
  entry.status = reason === "no-show" ? "no-show" : "cancelled";
  entry.leftAt = new Date();
  await entry.save();
  const snapshot = await recomputePositions(restaurantId);
  emitQueueUpdated(restaurantId, { queueLength: snapshot.length });
  return { message: "Order removed from queue.", data: shapeStaffEntry(entry) };
}

async function callNext(restaurantId) {
  const next = (await recomputePositions(restaurantId)).find((entry) => entry.status === "waiting");
  if (!next) throw new AppError("There is no one waiting in the queue.", 409, "queue_empty");
  return markPreparing(restaurantId, next._id);
}

async function getQueuePreview(restaurantId) {
  const restaurant = await Restaurant.findById(restaurantId).lean();
  if (!restaurant) throw new AppError("Restaurant not found.", 404, "not_found");
  const snapshot = await recomputePositions(restaurantId);
  const ordersAhead = snapshot.length;
  const minutes = ordersAhead * preparationMinutes(restaurant);
  return {
    data: {
      restaurantId: restaurant._id,
      restaurantName: restaurant.name,
      queueLength: snapshot.length,
      ordersAhead,
      isQueueEnabled: restaurant.isQueueEnabled,
      minutes,
      min: minutes,
      max: minutes,
      label: `${minutes} min`,
      estimatedWaitLabel: `${minutes} min`,
    },
    lastUpdated: new Date().toISOString(),
  };
}

module.exports = {
  joinQueue,
  getMyActiveEntry,
  leaveQueue,
  listQueue,
  callNext,
  removeFromQueue,
  markPreparing,
  markReady,
  markCollected,
  getQueuePreview,
  recomputePositions,
  shapeCustomerEntry,
  shapeStaffEntry,
  ACTIVE_STATUSES,
};
