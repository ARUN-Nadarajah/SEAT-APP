const mongoose = require("mongoose");

/**
 * Receipt Model — E-Receipt / Reservation Confirmation System.
 * Captures an immutable snapshot of a reservation when issued.
 * Supports versioning (V1, V2, etc.) when reservations are modified.
 * Payment status is explicitly "unpaid" (in-person settlement).
 */
const receiptSchema = new mongoose.Schema(
  {
    receiptNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      index: true,
    },
    bookingReference: {
      type: String,
      required: true,
      uppercase: true,
      index: true,
    },
    reservationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reservation",
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    version: {
      type: Number,
      required: true,
      default: 1,
    },
    status: {
      type: String,
      enum: ["current", "superseded"],
      default: "current",
      index: true,
    },
    customer: {
      name: { type: String, default: "" },
      email: { type: String, default: "" },
      phone: { type: String, default: "" },
    },
    restaurant: {
      name: { type: String, required: true },
      address: { type: String, default: "" },
      city: { type: String, default: "" },
      phone: { type: String, default: "" },
      cuisine: { type: String, default: "" },
    },
    table: {
      tableId: { type: mongoose.Schema.Types.ObjectId, ref: "Table" },
      tableNumber: { type: String, default: "" },
      capacity: { type: Number, default: 0 },
      location: { type: String, default: "" },
      type: { type: String, default: "Standard" },
    },
    reservation: {
      partySize: { type: Number, required: true },
      date: { type: Date, required: true },
      dateFormatted: { type: String, default: "" },
      startTime: { type: String, required: true },
      endTime: { type: String, required: true },
      durationMinutes: { type: Number, required: true },
      durationHours: { type: Number, required: true },
      specialRequest: { type: String, default: "" },
      guestName: { type: String, default: "" },
      guestPhone: { type: String, default: "" },
    },
    pricing: {
      hourlyRate: { type: Number, default: 0 },
      durationHours: { type: Number, default: 1 },
      durationMinutes: { type: Number, default: 60 },
      subtotal: { type: Number, default: 0 },
      reservationFee: { type: Number, default: 0 },
      currency: { type: String, default: "LKR" },
    },
    payment: {
      status: {
        type: String,
        enum: ["unpaid", "paid", "refunded"],
        default: "unpaid",
      },
      statusLabel: { type: String, default: "Unpaid" },
      paymentMethod: { type: String, default: "In-Person / Pay at Restaurant" },
      paidAt: { type: Date, default: null },
    },
    cancellationPolicy: {
      noticeRequiredHours: { type: Number, default: 24 },
      policyText: {
        type: String,
        default:
          "Cancellation requests must be submitted at least 24 hours before the reservation time and are subject to restaurant approval.",
      },
    },
    reservationStatus: {
      type: String,
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
    cancellationDetails: {
      requestedAt: { type: Date, default: null },
      reason: { type: String, default: "" },
      reviewedAt: { type: Date, default: null },
      reviewComment: { type: String, default: "" },
    },
    issuedAt: {
      type: Date,
      default: Date.now,
    },
    supersededAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

receiptSchema.index({ reservationId: 1, version: -1 });

receiptSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    receiptNumber: this.receiptNumber,
    bookingReference: this.bookingReference,
    reservationId: this.reservationId,
    version: this.version,
    status: this.status,
    customer: this.customer,
    restaurant: this.restaurant,
    table: this.table,
    reservation: this.reservation,
    pricing: this.pricing,
    payment: this.payment,
    cancellationPolicy: this.cancellationPolicy,
    reservationStatus: this.reservationStatus,
    cancellationDetails: this.cancellationDetails,
    issuedAt: this.issuedAt,
    supersededAt: this.supersededAt,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model("Receipt", receiptSchema);

