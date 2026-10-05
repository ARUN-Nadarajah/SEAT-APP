const Offer = require("../models/Offer");
const Reservation = require("../models/Reservation");
const Notification = require("../models/Notification");
const { notify } = require("./notification.service");
const { AppError } = require("../utils/errors");

function publicOffer(offer) {
  return typeof offer.toPublic === "function"
    ? offer.toPublic()
    : { ...offer, id: offer._id };
}

async function listForManager(restaurantId) {
  const offers = await Offer.find({ restaurantId }).sort({ createdAt: -1 });
  return offers.map(publicOffer);
}

async function create(restaurantId, input) {
  return publicOffer(await Offer.create({ ...input, restaurantId }));
}

async function update(restaurantId, id, input) {
  const offer = await Offer.findOneAndUpdate(
    { _id: id, restaurantId },
    input,
    { new: true, runValidators: true },
  );
  if (!offer) throw new AppError("Offer not found.", 404, "not_found");
  return publicOffer(offer);
}

async function remove(restaurantId, id) {
  const offer = await Offer.findOneAndDelete({ _id: id, restaurantId });
  if (!offer) throw new AppError("Offer not found.", 404, "not_found");
  return { id: offer._id };
}

async function listEligible(restaurantId, userId) {
  const now = new Date();
  const completedReservations = await Reservation.countDocuments({
    restaurantId,
    userId,
    status: "completed",
  });
  const offers = await Offer.find({
    restaurantId,
    active: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
    requiredReservations: { $lte: completedReservations },
  }).sort({ createdAt: -1 });
  return { offers: offers.map(publicOffer), completedReservations };
}

async function notifyEligibleOffers(userId, restaurantId) {
  const now = new Date();
  const completedReservations = await Reservation.countDocuments({
    restaurantId,
    userId,
    status: "completed",
  });
  const offers = await Offer.find({
    restaurantId,
    active: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
    requiredReservations: { $lte: completedReservations },
  }).lean();

  for (const offer of offers) {
    const alreadySent = await Notification.exists({
      userId,
      type: "offer",
      referenceId: offer._id,
    });
    if (alreadySent) continue;

    await notify({
      userId,
      type: "offer",
      title: "You unlocked a new offer",
      body: `${offer.title} is now available because you completed ${completedReservations} reservation${completedReservations === 1 ? "" : "s"}.`,
      route: `/restaurants/${restaurantId}/offers`,
      data: { offerId: String(offer._id), restaurantId: String(restaurantId) },
      referenceId: offer._id,
    });
  }
}

module.exports = {
  listForManager,
  create,
  update,
  remove,
  listEligible,
  notifyEligibleOffers,
};
