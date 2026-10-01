const mongoose = require("mongoose");

const reservationSchema = new mongoose.Schema(
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
    tableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Table",
      required: true,
    },
    reservationDate: {
      type: Date,
      required: true,
    },
    startTime: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },
    endTime: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },
    guestCount: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "confirmed", "arrived", "completed", "cancelled"],
      default: "pending",
    },
    specialRequest: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

reservationSchema.index({ userId: 1 });
reservationSchema.index({ restaurantId: 1, reservationDate: 1 });
reservationSchema.index({ tableId: 1, reservationDate: 1 });

module.exports = mongoose.model("Reservation", reservationSchema);
