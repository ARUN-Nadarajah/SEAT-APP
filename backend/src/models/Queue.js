const mongoose = require("mongoose");

const queueSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    guestCount: {
      type: Number,
      required: true,
      min: 1,
    },
    queueNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    estimatedWaitTime: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      required: true,
      enum: ["waiting", "called", "served", "cancelled"],
      default: "waiting",
    },
  },
  {
    timestamps: true,
  },
);

queueSchema.index({ restaurantId: 1 });
queueSchema.index({ restaurantId: 1, status: 1 });
queueSchema.index({ userId: 1 });

module.exports = mongoose.model("Queue", queueSchema);
