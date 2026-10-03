const { Server } = require("socket.io");

const { CORS_ORIGIN } = require("../config/environment");
const { setIO, roomName, getIO } = require("./events");

/**
 * Socket.IO setup (spec §7).
 *
 * Clients join a venue room and receive:
 *   - `queue:updated` → Queue Tracker refreshes position (FR05)
 *   - `queue:ready`   → full-screen "table is ready" appears (FR06)
 *   - `table:updated` → staff dashboard grid refreshes (FR08)
 *
 * The handshake may carry `?token=` for authenticated rooms; rooms are
 * venue-scoped (not user-scoped) because queue positions are shared state
 * that any guest of that restaurant may observe.
 */
function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN.split(",").map((o) => o.trim()),
      methods: ["GET", "POST"],
    },
    // Stay compatible with the Expo/RN WebSocket transport fallback.
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket) => {
    const initialRoom = socket.handshake.query?.restaurant;
    if (initialRoom) socket.join(roomName(initialRoom));

    /** Client subscribes to a venue's live updates. */
    socket.on("queue:subscribe", ({ restaurantId } = {}) => {
      if (restaurantId) socket.join(roomName(restaurantId));
    });

    socket.on("table:subscribe", ({ restaurantId } = {}) => {
      if (restaurantId) socket.join(roomName(restaurantId));
    });

    socket.on("queue:unsubscribe", ({ restaurantId } = {}) => {
      if (restaurantId) socket.leave(roomName(restaurantId));
    });

    socket.on("disconnect", () => {
      /* rooms are cleaned up automatically */
    });
  });

  setIO(io);

  // One-shot readiness log — handy when verifying live updates locally.
  io.on("connection", (socket) => {
    socket.emit("connected", { lastUpdated: new Date().toISOString() });
  });

  return io;
}

module.exports = { createSocketServer, getIO, roomName };
