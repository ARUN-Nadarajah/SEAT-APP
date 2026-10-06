const mongoose = require("mongoose");

/**
 * Menu item embedded in a restaurant (spec §6 `menuItems[]`).
 * Rendered by the "A taste of …" menu screen.
 */
const menuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, default: "Mains", trim: true },
    isVegetarian: { type: Boolean, default: false },
    isPopular: { type: Boolean, default: false },
  },
  { _id: false },
);

/**
 * Restaurant — a venue that can be reserved and can run a virtual queue.
 *
 * Spec §6 + FR01 (live availability shown on the Home list:
 * "Tonight from 7:00 PM", "15–25 min walk-in wait", available table count).
 */
const restaurantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    cuisine: {
      type: String,
      required: true,
      trim: true,
      default: "Sri Lankan",
    },
    description: {
      type: String,
      default: "",
    },
    images: {
      type: [String],
      default: [],
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 4.5,
    },
    reviewCount: {
      type: Number,
      default: 0,
    },
    priceRange: {
      type: String,
      enum: ["LKR 300–800", "LKR 800–1500", "LKR 1500–3000", "LKR 3000+"],
      default: "LKR 800–1500",
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    /** Jaffna, Sri Lanka by default (spec §5 Explore screen). */
    city: {
      type: String,
      default: "Jaffna",
      trim: true,
    },
    location: {
      lat: { type: Number, default: 9.6615 },
      lng: { type: Number, default: 80.0249 },
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    /** e.g. "11:00" — 24h HH:mm (matches the spec's slot model). */
    openingTime: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },
    closingTime: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },
    /** Chip on the details screen: "Open until 10:00 PM". */
    openHoursLabel: {
      type: String,
      default: "",
    },
    /** Chip on the details screen: "Parking available". */
    parking: {
      type: Boolean,
      default: false,
    },
    parkingLabel: {
      type: String,
      default: "Parking available",
    },
    /** Chip: distance shown on Explore cards ("450 m away"). */
    distanceMeters: {
      type: Number,
      default: 1000,
    },
    /** Typical dinner seating duration in minutes — drives the wait ETA. */
    averageSeatingMinutes: {
      type: Number,
      default: 75,
    },
    /** Typical takeaway preparation duration used by the virtual queue. */
    averagePreparationMinutes: {
      type: Number,
      default: 15,
      min: 1,
    },
    /** FR03 — join a virtual queue when no tables are free. */
    isQueueEnabled: {
      type: Boolean,
      default: true,
    },
    /** Shown as "Tonight from 7:00 PM" on Explore cards. */
    firstSlotLabel: {
      type: String,
      default: "7:00 PM",
    },
    /** Slot granularity in minutes used when generating time slots. */
    slotIntervalMinutes: {
      type: Number,
      default: 30,
    },
    menuItems: {
      type: [menuItemSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  {
    timestamps: true,
  },
);

restaurantSchema.index({ name: "text", cuisine: "text", description: "text" });

module.exports = mongoose.model("Restaurant", restaurantSchema);
