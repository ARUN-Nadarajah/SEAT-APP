const mongoose = require("mongoose");

/**
 * QueueEntry — spec §6.
 * Takeaway queue entry: one order, no table or party size.
 *
 * One document per customer per active queue. `position` is 1-based and
 * recomputed whenever entries are added or removed, so the customer's
 * "3 parties ahead" figure stays accurate.
 */
const queueEntrySchema = new mongoose.Schema(
  {
    queueCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
    },
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
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    /** 1-based position in the live takeaway queue. */
    position: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      required: true,
      enum: [
        "waiting",
        "cancelled",
        "no-show",
        "preparing",
        "ready",
        "collected",
      ],
      default: "waiting",
    },
    parcelToken: {
      type: String,
      default: "",
    },
    orderSummary: {
      type: String,
      default: "",
    },
    /** Minutes the customer is currently expected to wait (FR04). */
    estimatedWait: {
      type: Number,
      default: 0,
      min: 0,
    },
    /** Optional guest note captured when joining. */
    guestName: {
      type: String,
      default: "",
    },
    guestPhone: {
      type: String,
      default: "",
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    readyAt: {
      type: Date,
      default: null,
    },
    collectedAt: {
      type: Date,
      default: null,
    },
    leftAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

queueEntrySchema.index({ restaurantId: 1, status: 1, position: 1 });
queueEntrySchema.index({ userId: 1, status: 1 });

/** Public shape consumed by the customer Queue Tracker screen. */
queueEntrySchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    queueCode: this.queueCode,
    parcelToken: this.parcelToken || this.queueCode,
    orderSummary: this.orderSummary,
    userId: this.userId,
    restaurantId: this.restaurantId,
    orderId: this.orderId,
    position: this.position,
    status: this.status,
    estimatedWait: this.estimatedWait,
    guestName: this.guestName,
    heldTableNumber: this.heldTableNumber,
    joinedAt: this.joinedAt,
    readyAt: this.readyAt,
    collectedAt: this.collectedAt,
  };
};

module.exports = mongoose.model("QueueEntry", queueEntrySchema);
