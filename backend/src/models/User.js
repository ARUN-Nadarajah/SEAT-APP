const mongoose = require("mongoose");

/**
 * Per-channel notification preferences (spec §6 + Profile screen).
 * The test user in the brief specifically expects an email toggle.
 */
const notificationPrefsSchema = new mongoose.Schema(
  {
    push: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    /** Mock SMS channel (spec §1: simulated channel option) */
    sms: { type: Boolean, default: false },
    /** Mock WhatsApp channel */
    whatsapp: { type: Boolean, default: false },
  },
  { _id: false },
);

/**
 * User — customers, restaurant staff and managers.
 *
 * Spec §6: name, email, phone, passwordHash, role,
 * restaurantId for staff/manager, notificationPrefs, pushToken.
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    /** bcrypt hash (spec NFR04 — never store plain passwords). */
    passwordHash: {
      type: String,
      select: false,
    },
    /** Legacy field for backwards compatibility with accounts created before field rename. */
    password: {
      type: String,
      select: false,
    },
    phone: {
      type: String,
      default: "",
    },
    role: {
      type: String,
      required: true,
      enum: ["customer", "staff", "manager"],
      default: "customer",
    },
    /** Required for staff and manager accounts (spec §2 / §6). */
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      default: null,
    },
    notificationPrefs: {
      type: notificationPrefsSchema,
      default: () => ({}),
    },
    /** Expo push token, registered from the Profile screen. */
    pushToken: {
      type: String,
      default: "",
    },
    profileImage: {
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

// `email` is already unique via the field definition above.
userSchema.index({ restaurantId: 1 });

/** Safe projection for API responses — never leaks the hash. */
userSchema.pre("save", function (next) {
  if (!this.passwordHash && this.password) {
    this.passwordHash = this.password;
  }
  next();
});

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    phone: this.phone,
    role: this.role,
    restaurantId: this.restaurantId || null,
    notificationPrefs: this.notificationPrefs,
    pushToken: this.pushToken,
    profileImage: this.profileImage,
    createdAt: this.createdAt,
  };
};

/** Retrieve password hash across current and legacy schemas. */
userSchema.methods.getStoredPasswordHash = function getStoredPasswordHash() {
  return (
    this.passwordHash ||
    this.password ||
    (typeof this.get === "function" ? this.get("passwordHash") || this.get("password") : null) ||
    this._doc?.passwordHash ||
    this._doc?.password ||
    null
  );
};

module.exports = mongoose.model("User", userSchema);
