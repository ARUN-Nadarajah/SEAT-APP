const QueueEntry = require("../models/QueueEntry");
const Restaurant = require("../models/Restaurant");
const Table = require("../models/Table");
const User = require("../models/User");

const { AppError } = require("../utils/errors");
const { notify } = require("./notification.service");
const {
  emitQueueUpdated,
  emitQueueReady,
} = require("../realtime/events");
const { seatingDuration, waitEstimate } = require("../utils/availability");

/** Statuses that still hold a place in line. */
const ACTIVE_STATUSES = ["waiting", "notified", "preparing", "ready"];

/** Human-friendly queue reference, e.g. "Q-0181" (spec §6). */
async function generateQueueCode() {
  const count = await QueueEntry.estimatedDocumentCount();
  const candidate = `Q-${String(count + 1).padStart(4, "0")}`;
  const existing = await QueueEntry.findOne({ queueCode: candidate });
  if (existing) {
    // Collisions happen after deletions — fall back to a random suffix.
    const suffix = String(Math.floor(Math.random() * 9000) + 1000);
    return `Q-${suffix}`;
  }
  return candidate;
}

/** Active entries for a venue, oldest first (== queue order). */
async function activeEntries(restaurantId) {
  return QueueEntry.find({
    restaurantId,
    status: { $in: ACTIVE_STATUSES },
  })
    .sort({ joinedAt: 1 })
    .populate("userId", "name phone email")
    .lean();
}

/**
 * Re-number every active entry 1..n after a join/leave/seat action, then
 * push the new snapshot to the venue room (FR05).
 */
async function recomputePositions(restaurantId) {
  const entries = await activeEntries(restaurantId);

  const restaurant = await Restaurant.findById(restaurantId).lean();
  const freeTables = await countFreeTables(restaurant, entries.length);

  const snapshot = entries.map((entry, index) => {
    const position = index + 1;
    const partiesAhead = position - 1;
    const estimate = waitEstimate({
      partiesAhead,
      averageSeatingMinutes: seatingDuration(restaurant),
      freeTables,
    });

    QueueEntry.updateOne(
      { _id: entry._id },
      { position, estimatedWait: estimate.minutes },
    ).exec();

    return {
      ...entry,
      position,
      partiesAhead,
      estimatedWait: estimate.minutes,
      estimateLabel: estimate.label,
    };
  });

  return snapshot;
}

/** How many tables could absorb the next party right now. */
async function countFreeTables(restaurant, partySize = 2) {
  if (!restaurant) return 0;
  const tables = await Table.find({
    restaurantId: restaurant._id,
    isActive: true,
  }).lean();

  const free = tables.filter((table) => table.status === "available");
  return free.length;
}

/** Shape a snapshot row for the staff queue panel (FR09). */
function shapeStaffEntry(entry) {
  const user = entry.userId;
  return {
    id: entry._id,
    queueCode: entry.queueCode,
    parcelToken: entry.parcelToken || entry.queueCode,
    orderSummary: entry.orderSummary || "",
    partySize: entry.partySize,
    position: entry.position,
    status: entry.status,
    estimatedWait: entry.estimatedWait,
    estimateLabel: `${entry.estimatedWait || 0} min`,
    guestName: entry.guestName || user?.name || "Guest",
    guestPhone: entry.guestPhone || user?.phone || "",
    heldTableNumber: entry.heldTableNumber,
    joinedAt: entry.joinedAt,
    notifiedAt: entry.notifiedAt,
    readyAt: entry.readyAt,
    collectedAt: entry.collectedAt,
    seatedAt: entry.seatedAt,
  };
}

/** Shape an entry for the customer Queue Tracker (FR04/FR05). */
function shapeCustomerEntry(entry, restaurant, partiesAhead, freeTables, queueLength = 0) {
  const estimate = waitEstimate({
    partiesAhead,
    averageSeatingMinutes: seatingDuration(restaurant),
    freeTables,
  });

  // Progress stages: Joined queue → Getting closer → Table ready.
  // "Getting closer" only kicks in once the line has actually moved, so a
  // brand-new join still reads as "Joined queue".
  const stage =
    entry.status === "notified"
      ? "table-ready"
      : partiesAhead <= 1 && queueLength > 1
        ? "getting-closer"
        : "joined";

  return {
    id: entry._id,
    queueCode: entry.queueCode,
    restaurantId: entry.restaurantId,
    restaurant: restaurant
      ? {
          id: restaurant._id,
          name: restaurant.name,
          address: restaurant.address,
          image: restaurant.images?.[0] || "",
        }
      : null,
    partySize: entry.partySize,
    position: entry.position,
    partiesAhead,
    status: entry.status,
    stage,
    estimatedWait: estimate.minutes,
    estimateLabel: estimate.label,
    estimatedWaitLabel: estimate.label,
    guestName: entry.guestName,
    heldTableNumber: entry.heldTableNumber,
    joinedAt: entry.joinedAt,
    notifiedAt: entry.notifiedAt,
    seatedAt: entry.seatedAt,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * FR03 — join the virtual queue from Restaurant Details.
 *
 * Validates the venue runs a queue, rejects duplicate active entries and
 * appends the party to the end of the line.
 */
async function joinQueue(userId, payload) {
  const restaurant = await Restaurant.findById(payload.restaurantId).lean();
  if (!restaurant) {
    throw new AppError("Restaurant not found.", 404, "not_found");
  }
  if (!restaurant.isQueueEnabled) {
    throw new AppError(
      "This restaurant is not running a virtual queue right now.",
      409,
      "queue_disabled",
    );
  }

  const partySize = Number(payload.partySize) || 0;
  if (partySize < 1 || partySize > 20) {
    throw new AppError(
      "Party size must be between 1 and 20 guests.",
      400,
      "validation_error",
    );
  }

  const existing = await QueueEntry.findOne({
    userId,
    restaurantId: restaurant._id,
    status: { $in: ACTIVE_STATUSES },
  });

  if (existing) {
    throw new AppError(
      "You are already in this queue.",
      409,
      "already_in_queue",
      { queueCode: existing.queueCode, entryId: existing._id },
    );
  }

  const user = await User.findById(userId);
  const snapshot = await recomputePositions(restaurant._id);
  const freeTables = await countFreeTables(restaurant, partySize);

  const entry = await QueueEntry.create({
    queueCode: await generateQueueCode(),
    userId,
    restaurantId: restaurant._id,
    partySize,
    position: snapshot.length + 1,
    status: "waiting",
    guestName: payload.guestName || user?.name || "",
    guestPhone: payload.guestPhone || user?.phone || "",
    estimatedWait: 0,
    joinedAt: new Date(),
  });

  const updated = await recomputePositions(restaurant._id);
  const created = updated.find((row) => String(row._id) === String(entry._id));

  const partiesAhead = created ? created.position - 1 : updated.length;
  const data = shapeCustomerEntry(
    { ...entry.toObject(), position: created?.position || entry.position },
    restaurant,
    partiesAhead,
    freeTables,
    updated.length,
  );

  emitQueueUpdated(restaurant._id, {
    queueLength: updated.length,
    entryId: entry._id,
    position: data.position,
  });

  await notify({
    userId,
    type: "queue",
    title: "You're in the queue",
    body: `${restaurant.name} — you're number ${data.position}. ${data.estimateLabel} estimated wait.`,
    route: "/queue",
    data: { queueCode: entry.queueCode },
    channel: "push",
  });

  return {
    message: "Your spot is saved.",
    data,
  };
}

/**
 * FR04/FR05 — the customer's active entry (or `null` for the empty state).
 */
async function getMyActiveEntry(userId, restaurantId = null) {
  const filter = { userId, status: { $in: ACTIVE_STATUSES } };
  if (restaurantId) filter.restaurantId = restaurantId;

  const entry = await QueueEntry.findOne(filter)
    .sort({ joinedAt: -1 })
    .lean();

  if (!entry) {
    return { data: null, lastUpdated: new Date().toISOString() };
  }

  const restaurant = await Restaurant.findById(entry.restaurantId).lean();
  const snapshot = await recomputePositions(entry.restaurantId);
  const current = snapshot.find((row) => String(row._id) === String(entry._id));
  const freeTables = await countFreeTables(restaurant, entry.partySize);

  const position = current?.position || entry.position;
  const data = shapeCustomerEntry(
    { ...entry, position },
    restaurant,
    position - 1,
    freeTables,
    snapshot.length,
  );

  return {
    data,
    queueLength: snapshot.length,
    lastUpdated: data.lastUpdated,
  };
}

/** FR03 — leaving needs no confirmation server-side, but must re-number. */
async function leaveQueue(userId, entryId) {
  const entry = await QueueEntry.findOne({
    _id: entryId,
    userId,
    status: { $in: ACTIVE_STATUSES },
  });

  if (!entry) {
    throw new AppError("Queue entry not found.", 404, "not_found");
  }

  entry.status = "left";
  entry.leftAt = new Date();
  await entry.save();

  await releaseHeldTable(entry);
  const snapshot = await recomputePositions(entry.restaurantId);

  emitQueueUpdated(entry.restaurantId, { queueLength: snapshot.length });

  return {
    message: "You have left the queue.",
    data: { id: entry._id, queueCode: entry.queueCode, status: entry.status },
  };
}

/** Staff view of the live queue (FR09). */
async function listQueue(restaurantId) {
  const snapshot = await recomputePositions(restaurantId);
  const restaurant = await Restaurant.findById(restaurantId).lean();

  const data = snapshot.map((entry) => ({
    ...shapeStaffEntry(entry),
    estimateLabel: waitEstimate({
      partiesAhead: entry.position - 1,
      averageSeatingMinutes: seatingDuration(restaurant),
      freeTables: 1,
    }).label,
  }));

  return {
    data,
    total: data.length,
    waiting: data.filter((entry) => entry.status === "waiting").length,
    notified: data.filter((entry) => entry.status === "notified").length,
    lastUpdated: new Date().toISOString(),
  };
}

/** First available table big enough for the party. */
async function pickTable(restaurantId, partySize) {
  const tables = await Table.find({ restaurantId }).lean();
  const candidates = tables
    .filter(
      (table) =>
        table.status === "available" &&
        table.isActive !== false &&
        table.capacity >= partySize,
    )
    .sort((a, b) => a.capacity - b.capacity);

  return candidates[0] || null;
}

/**
 * FR09 — "call next": promote the first waiting party, hold a table and
 * tell them their table is ready (FR06).
 */
async function callNext(restaurantId) {
  const snapshot = await recomputePositions(restaurantId);
  const next = snapshot.find((entry) => entry.status === "waiting");

  if (!next) {
    throw new AppError("There is no one waiting in the queue.", 409, "queue_empty");
  }

  const entry = await QueueEntry.findById(next._id);
  const table = await pickTable(restaurantId, entry.partySize);

  entry.status = "notified";
  entry.notifiedAt = new Date();
  entry.heldTableNumber = table ? table.tableNumber : "";
  await entry.save();

  if (table) {
    await Table.findByIdAndUpdate(table._id, {
      status: "reserved",
      statusChangedAt: new Date(),
      statusChangedBy: null,
    });
  }

  const restaurant = await Restaurant.findById(restaurantId).lean();
  const partiesAhead = 0;

  await notify({
    userId: entry.userId,
    type: "table-ready",
    title: "Come in. Your table is ready",
    body: `${restaurant.name} is ready for ${entry.partySize}. Your table${
      table ? ` ${table.tableNumber}` : ""
    } is being held for you.`,
    route: "/queue/ready",
    data: {
      queueCode: entry.queueCode,
      tableNumber: table?.tableNumber || "",
      restaurantName: restaurant.name,
    },
    channel: "push",
  });

  const updatedSnapshot = await recomputePositions(restaurantId);

  emitQueueReady(restaurantId, {
    entryId: entry._id,
    userId: String(entry.userId),
    queueCode: entry.queueCode,
    tableNumber: table?.tableNumber || "",
    restaurantName: restaurant.name,
  });
  emitQueueUpdated(restaurantId, { queueLength: updatedSnapshot.length });

  return {
    message: "The good news is sent.",
    data: {
      entryId: entry._id,
      queueCode: entry.queueCode,
      partySize: entry.partySize,
      guestName: entry.guestName,
      tableNumber: table?.tableNumber || "",
      tableCapacity: table?.capacity || null,
      notifiedAt: entry.notifiedAt,
      status: entry.status,
      partiesAhead,
      lastUpdated: new Date().toISOString(),
    },
  };
}

/** FR06 — re-send the "table is ready" message for one party. */
async function notifyReady(restaurantId, entryId) {
  const entry = await QueueEntry.findOne({
    _id: entryId,
    restaurantId,
    status: { $in: ACTIVE_STATUSES },
  });
  if (!entry) {
    throw new AppError("Queue entry not found.", 404, "not_found");
  }

  const restaurant = await Restaurant.findById(restaurantId).lean();

  if (entry.status === "waiting") {
    entry.status = "notified";
    entry.notifiedAt = new Date();
    if (!entry.heldTableNumber) {
      const table = await pickTable(restaurantId, entry.partySize);
      if (table) {
        entry.heldTableNumber = table.tableNumber;
        await Table.findByIdAndUpdate(table._id, {
          status: "reserved",
          statusChangedAt: new Date(),
        });
      }
    }
    await entry.save();
  }

  await notify({
    userId: entry.userId,
    type: "table-ready",
    title: "Come in. Your table is ready",
    body: `${restaurant.name} is ready for you${
      entry.heldTableNumber ? ` — table ${entry.heldTableNumber}` : ""
    }.`,
    route: "/queue/ready",
    data: {
      queueCode: entry.queueCode,
      tableNumber: entry.heldTableNumber,
      restaurantName: restaurant.name,
    },
    channel: "push",
  });

  emitQueueReady(restaurantId, {
    entryId: entry._id,
    userId: String(entry.userId),
    queueCode: entry.queueCode,
    tableNumber: entry.heldTableNumber,
    restaurantName: restaurant.name,
  });

  return {
    message: "The good news is sent.",
    data: {
      entryId: entry._id,
      queueCode: entry.queueCode,
      tableNumber: entry.heldTableNumber,
      status: entry.status,
      notifiedAt: entry.notifiedAt,
      lastUpdated: new Date().toISOString(),
    },
  };
}

/** FR09 — seat the party and mark their held table occupied. */
async function seatParty(restaurantId, entryId) {
  const entry = await QueueEntry.findOne({ _id: entryId, restaurantId });
  if (!entry) {
    throw new AppError("Queue entry not found.", 404, "not_found");
  }

  entry.status = "seated";
  entry.seatedAt = new Date();
  await entry.save();

  if (entry.heldTableNumber) {
    await Table.findOneAndUpdate(
      { restaurantId, tableNumber: entry.heldTableNumber },
      { status: "occupied", statusChangedAt: new Date() },
    );
  }

  const snapshot = await recomputePositions(restaurantId);
  emitQueueUpdated(restaurantId, { queueLength: snapshot.length });

  await notify({
    userId: entry.userId,
    type: "queue",
    title: "Welcome to your table",
    body: "Enjoy your meal — your queue spot has been used.",
    route: "/queue/arrived",
    data: { queueCode: entry.queueCode },
    channel: "push",
  });

  return {
    message: "Party seated.",
    data: {
      entryId: entry._id,
      queueCode: entry.queueCode,
      status: entry.status,
      tableNumber: entry.heldTableNumber,
      seatedAt: entry.seatedAt,
    },
  };
}

/** FR09 — remove a party (no-show, or they left on their own). */
async function removeFromQueue(restaurantId, entryId, reason = "no-show") {
  const entry = await QueueEntry.findOne({ _id: entryId, restaurantId });
  if (!entry) {
    throw new AppError("Queue entry not found.", 404, "not_found");
  }

  entry.status = reason === "left" ? "left" : "no-show";
  entry.leftAt = new Date();
  await entry.save();

  await releaseHeldTable(entry);
  const snapshot = await recomputePositions(restaurantId);
  emitQueueUpdated(restaurantId, { queueLength: snapshot.length });

  return {
    message: entry.status === "left" ? "Party removed from queue." : "Marked as no-show.",
    data: {
      entryId: entry._id,
      queueCode: entry.queueCode,
      status: entry.status,
      removedAt: entry.leftAt,
    },
  };
}

/** Return a held table to the floor plan when a party drops out. */
async function releaseHeldTable(entry) {
  if (!entry.heldTableNumber) return;
  await Table.findOneAndUpdate(
    { restaurantId: entry.restaurantId, tableNumber: entry.heldTableNumber, status: "reserved" },
    { status: "available", statusChangedAt: new Date() },
  );
}

/**
 * Wait-estimate preview for the Join Queue screen before joining (FR04).
 */
async function getQueuePreview(restaurantId, partySize = 2) {
  const restaurant = await Restaurant.findById(restaurantId).lean();
  if (!restaurant) {
    throw new AppError("Restaurant not found.", 404, "not_found");
  }

  const snapshot = await recomputePositions(restaurantId);
  const partiesAhead = snapshot.length;
  const freeTables = await countFreeTables(restaurant, partySize);

  const estimate = waitEstimate({
    partiesAhead,
    averageSeatingMinutes: seatingDuration(restaurant),
    freeTables,
  });

  return {
    data: {
      restaurantId: restaurant._id,
      restaurantName: restaurant.name,
      queueLength: snapshot.length,
      partiesAhead,
      isQueueEnabled: restaurant.isQueueEnabled,
      ...estimate,
      estimatedWaitLabel: estimate.label,
      freeTables,
    },
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Staff parcel / takeaway queue actions (Sobiyan).
 */

/** POST /api/queue/staff/:id/preparing — mark parcel as preparing. */
async function markPreparing(restaurantId, entryId) {
  const entry = await QueueEntry.findOne({ _id: entryId, restaurantId });
  if (!entry) {
    throw new AppError("Queue entry not found.", 404, "not_found");
  }

  entry.status = "preparing";
  await entry.save();

  emitQueueUpdated(restaurantId, { entryId: entry._id, status: "preparing" });

  return {
    message: "Order marked as preparing.",
    data: shapeStaffEntry(entry),
  };
}

/** POST /api/queue/staff/:id/ready — mark parcel ready and alert customer. */
async function markReady(restaurantId, entryId) {
  const entry = await QueueEntry.findOne({ _id: entryId, restaurantId });
  if (!entry) {
    throw new AppError("Queue entry not found.", 404, "not_found");
  }

  entry.status = "ready";
  entry.readyAt = new Date();
  await entry.save();

  const restaurant = await Restaurant.findById(restaurantId).lean();

  await notify({
    userId: entry.userId,
    type: "queue-update",
    title: "Your parcel is ready for pickup!",
    body: `${restaurant ? restaurant.name : "SEAT"}: Your parcel (${entry.parcelToken || entry.queueCode}) is ready at the collection counter.`,
    route: "/queue",
    data: {
      queueCode: entry.queueCode,
      parcelToken: entry.parcelToken || entry.queueCode,
    },
    channel: "push",
  });

  emitQueueReady(restaurantId, {
    entryId: entry._id,
    userId: String(entry.userId),
    queueCode: entry.queueCode,
    parcelToken: entry.parcelToken || entry.queueCode,
    restaurantName: restaurant?.name || "",
    type: "parcel",
  });
  emitQueueUpdated(restaurantId, { entryId: entry._id, status: "ready" });

  return {
    message: "Customer notified that parcel is ready.",
    data: shapeStaffEntry(entry),
  };
}

/** POST /api/queue/staff/:id/collect — mark parcel collected and remove from active line. */
async function markCollected(restaurantId, entryId) {
  const entry = await QueueEntry.findOne({ _id: entryId, restaurantId });
  if (!entry) {
    throw new AppError("Queue entry not found.", 404, "not_found");
  }

  entry.status = "collected";
  entry.collectedAt = new Date();
  await entry.save();

  const snapshot = await recomputePositions(restaurantId);
  emitQueueUpdated(restaurantId, { queueLength: snapshot.length });

  return {
    message: "Parcel marked as collected.",
    data: shapeStaffEntry(entry),
  };
}

module.exports = {
  joinQueue,
  getMyActiveEntry,
  leaveQueue,
  listQueue,
  callNext,
  notifyReady,
  seatParty,
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
