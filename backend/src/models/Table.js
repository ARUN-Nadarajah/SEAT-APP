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
  },
  {
    timestamps: true,
  },
);

tableSchema.index({ restaurantId: 1, tableNumber: 1 }, { unique: true });

tableSchema.index({ restaurantId: 1 });

module.exports = mongoose.model("Table", tableSchema);
