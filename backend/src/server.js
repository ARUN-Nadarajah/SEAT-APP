require("dotenv").config();

const dns = require("dns");
// Prioritize IPv4 DNS lookups so cloud platforms without IPv6 routing
// (such as Render Linux containers) do not fail with ENETUNREACH.
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

const http = require("http");

const app = require("./app");
const connectDB = require("./config/database");
const { PORT } = require("./config/environment");
const { createSocketServer } = require("./realtime/socket");
const { releaseExpiredReservationTables } = require("./services/table.service");

const startServer = async () => {
  await connectDB();

  // Socket.IO shares the Express server so both APIs live on one port.
  const server = http.createServer(app);
  createSocketServer(server);

  server.listen(PORT, () => {
    console.log(`API + Socket.IO running on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });

  const reconcileExpiredTables = () => {
    releaseExpiredReservationTables().catch((error) => {
      console.error("[tables] Failed to release expired reservations:", error);
    });
  };

  reconcileExpiredTables();
  setInterval(reconcileExpiredTables, 60_000);
};

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
