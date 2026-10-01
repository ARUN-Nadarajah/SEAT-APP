require("dotenv").config();

const app = require("./app");
const connectDB = require("./config/database");
const { PORT } = require("./config/environment");

const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
