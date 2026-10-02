const mongoose = require("mongoose");

const authOtpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    purpose: {
      type: String,
      required: true,
      enum: ["register", "login", "password_reset"],
    },
    codeHash: {
      type: String,
      required: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 5,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

authOtpSchema.index({ email: 1, purpose: 1, consumedAt: 1, expiresAt: 1 });

module.exports = mongoose.model("AuthOtp", authOtpSchema);
