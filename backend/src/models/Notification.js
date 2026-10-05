const mongoose = require("mongoose");

/**
 * Notification — spec §6.
 * (userId, type, title, body, read, createdAt)
 *
 * `type` drives the in-app icon; `channel` records which simulated
 * delivery channel (push / email / sms / whatsapp) was used.
 */
const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        "reservation",
        "queue",
        "table-ready",
        "queue-update",
        "order",
        "account",
        "general",
      ],
      default: "general",
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
    /** Optional deep link target, e.g. `/bookings/RES-1234`. */
    route: {
      type: String,
      default: "",
    },
    /** Structured payload for the "table ready" full-screen action. */
    data: {
      type: Object,
      default: () => ({}),
    },
    channel: {
      type: String,
      enum: ["push", "email", "sms", "whatsapp", "in-app"],
      default: "in-app",
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

notificationSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    type: this.type,
    title: this.title,
    body: this.body,
    read: this.read,
    route: this.route,
    data: this.data,
    channel: this.channel,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model("Notification", notificationSchema);
