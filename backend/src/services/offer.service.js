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
  const offer = await Offer.create({ ...input, restaurantId });
  await notifyExistingEligibleCustomers(offer);
  return publicOffer(offer);
}

async function update(restaurantId, id, input) {
  const offer = await Offer.findOneAndUpdate(
    { _id: id, restaurantId },
    input,
    { new: true, runValidators: true },
  );
  if (!offer) throw new AppError("Offer not found.", 404, "not_found");
  await notifyExistingEligibleCustomers(offer);
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
    // Eligibility is based on the customer's total completed reservations,
    // including reservations completed before the offer was created.
    requiredReservations: { $lte: completedReservations },
  }).lean();

  await notifyUserAboutOffers(userId, restaurantId, offers, completedReservations);
}

async function syncEligibleOfferNotifications(userId) {
  const restaurantIds = await Reservation.distinct("restaurantId", {
    userId,
    status: "completed",
  });

  await Promise.all(
    restaurantIds.map((restaurantId) =>
      notifyEligibleOffers(userId, restaurantId),
    ),
  );
}

/**
 * Newly created offers must also notify customers who completed their
 * reservations before the manager published the offer.
 */
async function notifyExistingEligibleCustomers(offer) {
  const now = new Date();
  if (
    !offer.active ||
    offer.startDate > now ||
    offer.endDate < now
  ) {
    return;
  }

  const userIds = await Reservation.distinct("userId", {
    restaurantId: offer.restaurantId,
    status: "completed",
  });

  await Promise.all(
    userIds.map(async (userId) => {
      const completedReservations = await Reservation.countDocuments({
        restaurantId: offer.restaurantId,
        userId,
        status: "completed",
      });
      if (completedReservations < offer.requiredReservations) return;
      await notifyUserAboutOffers(
        userId,
        offer.restaurantId,
        [offer],
        completedReservations,
      );
    }),
  );
}

async function notifyUserAboutOffers(userId, restaurantId, offers, completedReservations) {
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
      route: `/offer/${offer._id}?restaurantId=${restaurantId}`,
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
  syncEligibleOfferNotifications,
};
