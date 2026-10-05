const mongoose = require("mongoose");

/**
 * A restaurant promotion. Images are stored as the URI supplied by the
 * client; the app currently has no upload service, so local and remote URIs
 * are both intentionally supported.
 */
const offerSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    type: { type: String, enum: ["Percentage", "Value"], required: true },
    value: { type: String, required: true, trim: true },
    requiredReservations: { type: Number, required: true, min: 1 },
    active: { type: Boolean, default: true },
    image: { type: String, default: "" },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
  },
  { timestamps: true },
);

offerSchema.index({ restaurantId: 1, active: 1, startDate: 1, endDate: 1 });

offerSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    restaurantId: this.restaurantId,
    title: this.title,
    description: this.description,
    type: this.type,
    value: this.value,
    requiredReservations: this.requiredReservations,
    active: this.active,
    image: this.image,
    startDate: this.startDate.toISOString().slice(0, 10),
    endDate: this.endDate.toISOString().slice(0, 10),
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model("Offer", offerSchema);
