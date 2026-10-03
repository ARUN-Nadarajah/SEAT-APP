const Notification = require("../models/Notification");
const User = require("../models/User");

const { AppError } = require("../utils/errors");
const { sendMail } = require("./email.service");

/**
 * Notifications (FR06 + spec §7).
 *
 * Every message is stored in-app (the Notifications screen reads these),
 * then fanned out to the channels the user enabled in Profile:
 * push (Expo), email, plus the simulated SMS/WhatsApp channels which are
 * logged rather than actually delivered.
 */

/** Best-effort Expo push. Never throws — delivery is not request-critical. */
async function sendExpoPush(pushToken, { title, body, data }) {
  if (!pushToken || !pushToken.startsWith("ExpoPushToken")) return false;

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: pushToken,
        title,
        body,
        data,
        sound: "default",
      }),
    });
    return response.ok;
  } catch (error) {
    console.warn("[push] delivery skipped:", error.message);
    return false;
  }
}

/** Simulated SMS/WhatsApp channel (spec §1: mock channel option). */
function logSimulatedChannel(channel, recipient, title) {
  console.info(`[simulated-${channel}] → ${recipient || "unknown"}: ${title}`);
}

/**
 * Create + fan out one notification.
 * @returns {Promise<object|null>} the stored notification, or null when the
 *   user has notifications disabled for every channel.
 */
async function notify({
  userId,
  type = "general",
  title,
  body,
  route = "",
  data = {},
  channel = "push",
  referenceId = null,
}) {
  if (!userId || !title || !body) return null;

  const user = await User.findById(userId).lean();
  if (!user || !user.isActive) return null;

  const prefs = user.notificationPrefs || {};

  // Persist in-app regardless of channel prefs so the list screen is full.
  const notification = await Notification.create({
    userId,
    type,
    title,
    body,
    route,
    data,
    channel: "in-app",
    referenceId,
  });

  if (prefs.push !== false && user.pushToken) {
    await sendExpoPush(user.pushToken, { title, body, data: { ...data, route } });
  }

  if (prefs.email === true) {
    try {
      await sendMail({
        to: user.email,
        subject: title,
        text: body,
        name: user.name,
      });
    } catch (error) {
      console.warn("[email] delivery skipped:", error.message);
    }
  }

  if (prefs.sms === true) logSimulatedChannel("sms", user.phone, title);
  if (prefs.whatsapp === true) logSimulatedChannel("whatsapp", user.phone, title);

  return notification;
}

/** Notify every active member of a venue's staff (staff dashboard events). */
async function notifyRestaurantStaff(restaurantId, payload) {
  const staff = await User.find({
    restaurantId,
    role: { $in: ["staff", "manager"] },
    isActive: true,
  })
    .select("_id")
    .lean();

  await Promise.all(
    staff.map((member) =>
      notify({ ...payload, userId: member._id, type: payload.type || "general" }),
    ),
  );
}

/** GET /api/notifications — newest first (spec §7). */
async function listNotifications(userId, options = {}) {
  const filter = { userId };
  if (options.unreadOnly) filter.read = false;
  if (options.type) filter.type = options.type;

  const [notifications, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(options.limit) || 50)
      .lean(),
    Notification.countDocuments({ userId, read: false }),
  ]);

  return {
    data: notifications.map((entry) => ({
      id: entry._id,
      type: entry.type,
      title: entry.title,
      body: entry.body,
      read: entry.read,
      route: entry.route,
      data: entry.data,
      channel: entry.channel,
      createdAt: entry.createdAt,
    })),
    unreadCount,
    lastUpdated: new Date().toISOString(),
  };
}

/** PATCH /api/notifications/:id/read */
async function markRead(id, userId) {
  const notification = await Notification.findOneAndUpdate(
    { _id: id, userId },
    { read: true },
    { new: true },
  );
  if (!notification) {
    throw new AppError("Notification not found.", 404, "not_found");
  }
  return { data: { id: notification._id, read: notification.read } };
}

/** POST /api/notifications/read-all */
async function markAllRead(userId) {
  await Notification.updateMany({ userId, read: false }, { read: true });
  const unreadCount = await Notification.countDocuments({ userId, read: false });
  return { data: { unreadCount } };
}

/** POST /api/notifications/push-token — register Expo push token. */
async function registerPushToken(userId, pushToken) {
  await User.findByIdAndUpdate(userId, { pushToken: String(pushToken || "") });
  return { data: { pushToken: String(pushToken || ""), registered: Boolean(pushToken) } };
}

module.exports = {
  notify,
  notifyRestaurantStaff,
  listNotifications,
  markRead,
  markAllRead,
  registerPushToken,
  sendExpoPush,
};
