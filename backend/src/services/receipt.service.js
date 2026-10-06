const Receipt = require("../models/Receipt");
const Reservation = require("../models/Reservation");
const User = require("../models/User");
const Restaurant = require("../models/Restaurant");
const Table = require("../models/Table");
const { AppError } = require("../utils/errors");

/**
 * Format a Date to a human-readable calendar string.
 * e.g. "Friday, October 10, 2026"
 */
function formatDateLabel(date) {
  try {
    const d = new Date(date);
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return String(date);
  }
}

/**
 * Generate a snapshot object from populated reservation data.
 */
function extractSnapshotData(reservation, user, restaurant, table, version) {
  const partySize = Number(reservation.partySize) || 1;
  const startTime = reservation.time || reservation.startTime || "12:00";
  const endTime = reservation.endTime || "13:00";
  const durationMinutes = Number(reservation.durationMinutes) || 60;
  const durationHours = durationMinutes / 60;

  const hourlyRate =
    reservation.hourlyRate !== undefined && reservation.hourlyRate !== null
      ? reservation.hourlyRate
      : (table?.hourlyReservationRate !== undefined ? table.hourlyReservationRate : 300);

  const reservationFee =
    reservation.reservationFee !== undefined && reservation.reservationFee !== null
      ? reservation.reservationFee
      : Math.round(hourlyRate * durationHours);

  const bookingReference = reservation.bookingId;
  const receiptNumber = `REC-${bookingReference}-V${version}`;

  return {
    receiptNumber,
    bookingReference,
    reservationId: reservation._id,
    customerId: reservation.userId,
    restaurantId: reservation.restaurantId._id || reservation.restaurantId,
    version,
    status: "current",
    customer: {
      name: reservation.guestName || user?.name || "Guest",
      email: user?.email || "",
      phone: reservation.guestPhone || user?.phone || "",
    },
    restaurant: {
      name: restaurant?.name || "Restaurant",
      address: restaurant?.address || "",
      city: restaurant?.city || "",
      phone: restaurant?.phone || "",
      cuisine: restaurant?.cuisine || "",
    },
    table: {
      tableId: table?._id || reservation.tableId,
      tableNumber: table?.tableNumber || "",
      capacity: table?.capacity || partySize,
      location: table?.location || "",
      type: table?.type || "Standard",
    },
    reservation: {
      partySize,
      date: reservation.date,
      dateFormatted: formatDateLabel(reservation.date),
      startTime,
      endTime,
      durationMinutes,
      durationHours,
      specialRequest: reservation.specialRequest || "",
      guestName: reservation.guestName || user?.name || "",
      guestPhone: reservation.guestPhone || user?.phone || "",
    },
    pricing: {
      hourlyRate,
      durationHours,
      durationMinutes,
      subtotal: reservationFee,
      reservationFee,
      currency: "LKR",
    },
    payment: {
      status: "unpaid",
      statusLabel: "Unpaid",
      paymentMethod: "In-Person / Pay at Restaurant",
      paidAt: null,
    },
    cancellationPolicy: {
      noticeRequiredHours: 24,
      policyText:
        "Cancellation requests must be submitted at least 24 hours before the reservation time and are subject to restaurant approval.",
    },
    reservationStatus: reservation.status || "confirmed",
    cancellationDetails: {
      requestedAt: reservation.cancellationRequestedAt || null,
      reason: reservation.cancellationReason || "",
      reviewedAt: reservation.cancellationReviewedAt || null,
      reviewComment: reservation.cancellationReviewComment || "",
    },
    issuedAt: new Date(),
    supersededAt: null,
  };
}

/**
 * Generate a new receipt snapshot for a reservation.
 * If previous receipts exist, supersedes them and increments the version counter.
 */
async function generateReceipt(reservationId) {
  const reservation = await Reservation.findById(reservationId)
    .populate("restaurantId")
    .populate("tableId")
    .populate("userId");

  if (!reservation) {
    throw new AppError("Reservation not found for receipt issuance.", 404, "not_found");
  }

  // Find latest existing version
  const latestReceipt = await Receipt.findOne({ reservationId })
    .sort({ version: -1 })
    .lean();

  let nextVersion = 1;
  if (latestReceipt) {
    nextVersion = (latestReceipt.version || 1) + 1;
    // Supersede all existing active receipts for this reservation
    await Receipt.updateMany(
      { reservationId, status: "current" },
      { $set: { status: "superseded", supersededAt: new Date() } },
    );
  }

  const user = reservation.userId;
  const restaurant = reservation.restaurantId;
  const table = reservation.tableId;

  const snapshotData = extractSnapshotData(
    reservation,
    user,
    restaurant,
    table,
    nextVersion,
  );

  const receipt = await Receipt.create(snapshotData);
  return receipt;
}

/**
 * Creates a revision receipt (V2, V3...) when a reservation is modified.
 */
async function createRevisionReceipt(reservationId) {
  return generateReceipt(reservationId);
}

/**
 * Syncs reservation status updates into the current active receipt.
 */
async function syncReceiptStatus(reservationId, updates = {}) {
  const currentReceipt = await Receipt.findOne({
    reservationId,
    status: "current",
  });

  if (!currentReceipt) {
    return null;
  }

  if (updates.reservationStatus) {
    currentReceipt.reservationStatus = updates.reservationStatus;
  }

  if (updates.cancellationDetails) {
    currentReceipt.cancellationDetails = {
      ...currentReceipt.cancellationDetails.toObject(),
      ...updates.cancellationDetails,
    };
  }

  await currentReceipt.save();
  return currentReceipt;
}

/**
 * Retrieve the latest (current) receipt for a reservation, including version history.
 * If no receipt exists (legacy booking), generates one.
 */
async function getLatestReceipt(reservationId, requestingUser) {
  const reservation = await Reservation.findById(reservationId);
  if (!reservation) {
    throw new AppError("Reservation not found.", 404, "not_found");
  }

  // Security check: Customer can only view their own receipt; staff/manager can view their restaurant's
  const isOwner = String(reservation.userId) === String(requestingUser._id);
  const isStaff = ["staff", "manager"].includes(requestingUser.role);
  if (!isOwner && !isStaff) {
    throw new AppError(
      "You do not have permission to view this receipt.",
      403,
      "forbidden",
    );
  }

  let currentReceipt = await Receipt.findOne({
    reservationId,
    status: "current",
  }).sort({ version: -1 });

  if (!currentReceipt) {
    // Generate initial receipt if none exists yet
    currentReceipt = await generateReceipt(reservationId);
  }

  const allVersions = await Receipt.find({ reservationId })
    .sort({ version: -1 })
    .select("_id version receiptNumber status issuedAt supersededAt")
    .lean();

  return {
    receipt: currentReceipt.toPublic(),
    versions: allVersions.map((v) => ({
      id: String(v._id),
      version: v.version,
      receiptNumber: v.receiptNumber,
      status: v.status,
      issuedAt: v.issuedAt,
      supersededAt: v.supersededAt,
    })),
  };
}

/**
 * Retrieve a specific receipt version by ID or receipt number.
 */
async function getReceiptById(receiptIdOrNumber, requestingUser) {
  let receipt;
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(String(receiptIdOrNumber));

  if (isObjectId) {
    receipt = await Receipt.findById(receiptIdOrNumber);
  } else {
    receipt = await Receipt.findOne({
      receiptNumber: String(receiptIdOrNumber).toUpperCase(),
    });
  }

  if (!receipt) {
    throw new AppError("Receipt not found.", 404, "not_found");
  }

  // Security check
  const isOwner = String(receipt.customerId) === String(requestingUser._id);
  const isStaff = ["staff", "manager"].includes(requestingUser.role);
  if (!isOwner && !isStaff) {
    throw new AppError(
      "You do not have permission to view this receipt.",
      403,
      "forbidden",
    );
  }

  const allVersions = await Receipt.find({ reservationId: receipt.reservationId })
    .sort({ version: -1 })
    .select("_id version receiptNumber status issuedAt supersededAt")
    .lean();

  return {
    receipt: receipt.toPublic(),
    versions: allVersions.map((v) => ({
      id: String(v._id),
      version: v.version,
      receiptNumber: v.receiptNumber,
      status: v.status,
      issuedAt: v.issuedAt,
      supersededAt: v.supersededAt,
    })),
  };
}

module.exports = {
  generateReceipt,
  createRevisionReceipt,
  syncReceiptStatus,
  getLatestReceipt,
  getReceiptById,
};

