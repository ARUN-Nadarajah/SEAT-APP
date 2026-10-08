/**
 * Real-time event bus (spec §7: Socket.IO events).
 *
 * Services `require` this module and call `emit*()` directly, while the
 * Socket.IO server registers itself here via `setIO()`. That indirection
 * keeps services free of Socket.IO imports and avoids circular requires.
 *
 * Events emitted:
 *   queue:updated — any change to a venue's live queue (FR05)
 *   queue:left    — a customer left the queue
 *   queue:ready   — a party's table is ready (FR06)
 *   table:updated — staff toggled a table's status (FR08)
 */

let io = null;

function setIO(instance) {
  io = instance;
}

function getIO() {
  return io;
}

/** Room name convention: one room per venue, so staff share a channel. */
function roomName(restaurantId) {
  return `restaurant:${String(restaurantId)}`;
}

function emitToRestaurant(restaurantId, event, payload) {
  if (!io) return false;
  io.to(roomName(restaurantId)).emit(event, payload);
  return true;
}

/** FR05 — queue position/size changed for this venue. */
function emitQueueUpdated(restaurantId, payload) {
  return emitToRestaurant(restaurantId, "queue:updated", {
    restaurantId: String(restaurantId),
    lastUpdated: new Date().toISOString(),
    ...payload,
  });
}

/** Notify staff that a customer left the queue. */
function emitQueueLeft(restaurantId, payload) {
  return emitToRestaurant(restaurantId, "queue:left", {
    restaurantId: String(restaurantId),
    lastUpdated: new Date().toISOString(),
    ...payload,
  });
}

/** FR06 — "Come in, your table is ready" for one specific party. */
function emitQueueReady(restaurantId, payload) {
  return emitToRestaurant(restaurantId, "queue:ready", {
    restaurantId: String(restaurantId),
    lastUpdated: new Date().toISOString(),
    ...payload,
  });
}

/** FR08 — a table changed status on the staff dashboard. */
function emitTableUpdated(restaurantId, payload) {
  return emitToRestaurant(restaurantId, "table:updated", {
    restaurantId: String(restaurantId),
    lastUpdated: new Date().toISOString(),
    ...payload,
  });
}

/** Kitchen order marked ready for customer pickup / service (Sobiyan). */
function emitOrderReady(restaurantId, payload) {
  return emitToRestaurant(restaurantId, "order:ready", {
    restaurantId: String(restaurantId),
    lastUpdated: new Date().toISOString(),
    ...payload,
  });
}

/** Kitchen order updated (Sobiyan). */
function emitOrderUpdated(restaurantId, payload) {
  return emitToRestaurant(restaurantId, "order:updated", {
    restaurantId: String(restaurantId),
    lastUpdated: new Date().toISOString(),
    ...payload,
  });
}

module.exports = {
  setIO,
  getIO,
  roomName,
  emitQueueUpdated,
  emitQueueLeft,
  emitQueueReady,
  emitTableUpdated,
  emitOrderReady,
  emitOrderUpdated,
};
