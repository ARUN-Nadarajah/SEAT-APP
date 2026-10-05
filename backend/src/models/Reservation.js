const mongoose = require("mongoose");

/**
 * Reservation — spec §6.
 * (bookingId, userId, restaurantId, tableId, partySize, date, time,
 *  status: confirmed/checked-in/cancelled/completed/no-show, createdAt)
 */
const reservationSchema = new mongoose.Schema(
  {
    /** Human-friendly reference shown on the confirmation screen. */
    bookingId: {
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
    tableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Table",
      required: true,
    },
    partySize: {
      type: Number,
      required: true,
      min: 1,
      max: 20,
    },
    /** Calendar date the booking is for (start of day, UTC-normalised). */
    date: {
      type: Date,
      required: true,
    },
    /** "19:30" — 24h HH:mm start time of the booking. */
    time: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
    },
    /** Slot end, derived from the restaurant's seating duration. */
    endTime: {
      type: String,
      match: /^([01]\d|2[0-3]):[0-5]\d$/,
      default: "",
    },
    status: {
      type: String,
      required: true,
      enum: [
        "confirmed",
        "checked-in",
        "cancellation_pending",
        "cancelled",
        "completed",
        "no-show",
      ],
      default: "confirmed",
    },
    guestName: {
      type: String,
      default: "",
    },
    guestPhone: {
      type: String,
      default: "",
    },
    specialRequest: {
      type: String,
      default: "",
    },
    /** Set when staff checks the party in — used for avg-wait reporting. */
    checkedInAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancellationRequestedAt: {
      type: Date,
      default: null,
    },
    cancellationReason: {
      type: String,
      default: "",
    },
    cancellationReviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    cancellationReviewedAt: {
      type: Date,
      default: null,
    },
    cancellationReviewComment: {
      type: String,
      default: "",
    },
    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

reservationSchema.index({ userId: 1, date: -1 });
reservationSchema.index({ restaurantId: 1, date: 1 });
reservationSchema.index({ tableId: 1, date: 1, time: 1 });

/** Public shape consumed by the mobile app. */
reservationSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    bookingId: this.bookingId,
    userId: this.userId,
    restaurantId: this.restaurantId,
    tableId: this.tableId,
    partySize: this.partySize,
    date: this.date,
    time: this.time,
    endTime: this.endTime,
    status: this.status,
    guestName: this.guestName,
    specialRequest: this.specialRequest,
    checkedInAt: this.checkedInAt,
    cancelledAt: this.cancelledAt,
    cancellationRequestedAt: this.cancellationRequestedAt,
    cancellationReason: this.cancellationReason,
    cancellationReviewedBy: this.cancellationReviewedBy,
    cancellationReviewedAt: this.cancellationReviewedAt,
    cancellationReviewComment: this.cancellationReviewComment,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model("Reservation", reservationSchema);
