const mongoose = require("mongoose");

const tableSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    tableNumber: {
      type: String,
      required: true,
      trim: true,
    },
    capacity: {
      type: Number,
      required: true,
      min: 1,
    },
    location: {
      type: String,
      default: "",
    },
    type: {
      type: String,
      default: "Standard",
      trim: true,
    },
    status: {
      type: String,
      enum: ["available", "reserved", "occupied", "maintenance"],
      default: "available",
    },
    description: {
      type: String,
      default: "",
    },
    image: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    /** When the status last changed — powers the "Last updated" stamp. */
    statusChangedAt: {
      type: Date,
      default: Date.now,
    },
    statusChangedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

tableSchema.index({ restaurantId: 1, tableNumber: 1 }, { unique: true });

tableSchema.index({ restaurantId: 1 });

module.exports = mongoose.model("Table", tableSchema);
