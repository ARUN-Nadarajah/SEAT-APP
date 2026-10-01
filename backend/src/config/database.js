const mongoose = require("mongoose");
const { MONGODB_URI } = require("./environment");

const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });

    console.log("MongoDB connected");
    return mongoose.connection;
  } catch (error) {
    console.warn("MongoDB connection failed:", error.message);
    console.warn(
      "Continuing without a database connection for this scaffolded backend.",
    );
    return null;
  }
};

module.exports = connectDB;
