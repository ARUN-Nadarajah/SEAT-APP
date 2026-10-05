const dns = require("dns");
const mongoose = require("mongoose");
const { MONGODB_URI } = require("./environment");

// Some networks (wrong/blocked DNS servers) refuse Node's SRV queries, which
// breaks mongodb+srv:// URIs with "querySrv ECONNREFUSED". Public resolvers
// answer them fine, so on a DNS-shaped failure we retry once with those.
const PUBLIC_DNS = ["8.8.8.8", "1.1.1.1"];
const isDnsFailure = (error) =>
  /querySrv|ECONNREFUSED|EAI_AGAIN|ENOTFOUND/.test(error.message || "");

const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });

    console.log("MongoDB connected");
    return mongoose.connection;
  } catch (error) {
    // Retry once through public DNS resolvers before giving up.
    if (isDnsFailure(error)) {
      try {
        console.warn(
          `MongoDB SRV lookup failed (${error.message}); retrying with public DNS resolvers`,
        );
        dns.setServers(PUBLIC_DNS);
        await mongoose.connect(MONGODB_URI, {
          serverSelectionTimeoutMS: 8000,
        });
        console.log("MongoDB connected");
        return mongoose.connection;
      } catch (retryError) {
        console.warn("MongoDB connection failed:", retryError.message);
        console.warn(
          "Continuing without a database connection for this scaffolded backend.",
        );
        return null;
      }
    }
    console.warn("MongoDB connection failed:", error.message);
    console.warn(
      "Continuing without a database connection for this scaffolded backend.",
    );
  }
};

module.exports = connectDB;
