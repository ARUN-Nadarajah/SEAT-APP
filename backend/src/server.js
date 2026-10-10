require("dotenv").config();

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
