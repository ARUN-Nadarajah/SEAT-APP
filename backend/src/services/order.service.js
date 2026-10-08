const crypto = require("crypto");

const Order = require("../models/Order");
const Restaurant = require("../models/Restaurant");
const Food = require("../models/Food");
const Reservation = require("../models/Reservation");
const User = require("../models/User");
const QueueEntry = require("../models/QueueEntry");

const { AppError } = require("../utils/errors");
const { notify, notifyRestaurantStaff } = require("./notification.service");
const {
  emitOrderReady,
  emitOrderUpdated,
  emitQueueUpdated,
} = require("../realtime/events");

const VALID_STATUSES = [
  "placed",
  "preparing",
  "ready",
  "served",
  "collected",
  "cancelled",
];

const KITCHEN_ACTIVE_STATUSES = ["placed", "preparing", "ready"];

/** Generate friendly order / parcel token (e.g., ORD-2841 or P-1042). */
function generateOrderNumber(orderType = "dine_in") {
  const prefix = orderType === "takeaway" ? "P" : "ORD";
  const num = crypto.randomInt(1000, 10000);
  return `${prefix}-${num}`;
}

/** Shape order for responses. */
function shapeOrder(order) {
  const user = order.userId;
  const reservation = order.reservationId;

  return {
    id: order._id,
    orderCode: order.orderCode,
    restaurantId: order.restaurantId,
    orderType: order.orderType || "dine-in",
    status: order.status,
    tableId: order.tableId || reservation?.tableId || null,
    tableNumber: reservation?.tableNumber || "",
    queueEntryId: order.queueEntryId || null,
    items: (order.items || []).map((item) => ({
      menuItemId: item.menuItemId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      note: item.note || "",
      totalAmount: item.totalAmount,
    })),
    totalAmount: order.totalAmount,
    notes: order.notes || order.note || "",
    user: user && typeof user === "object"
      ? {
          id: user._id,
          name: user.name,
          phone: user.phone || "",
          email: user.email || "",
        }
      : null,
    reservation: reservation && typeof reservation === "object"
      ? {
          id: reservation._id,
          bookingId: reservation.bookingId,
          tableNumber: reservation.tableNumber,
          date: reservation.date,
          time: reservation.time,
        }
      : null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

/**
 * Customer / API order creation helper (Sobiyan / Lowmika integration).
 */
async function createOrder(userId, data) {
  const restaurant = await Restaurant.findById(data.restaurantId).lean();
  if (!restaurant) {
    throw new AppError("Restaurant not found.", 404, "not_found");
  }

  if (!Array.isArray(data.items) || data.items.length === 0) {
    throw new AppError("Order must contain at least one item.", 400, "validation_error");
  }

  let menuItems = restaurant.menuItems || [];
  if (menuItems.length === 0) {
    menuItems = await Food.find({
      restaurantId: restaurant._id,
      isAvailable: true,
    }).lean();
  }

  const items = data.items.map((item) => {
    const qty = Number(item.quantity) || 1;
    const menuItem = menuItems.find(
      (candidate) => String(candidate._id) === String(item.menuItemId || item.foodId),
    );
    if (!menuItem) {
      throw new AppError("Every order item must be on the restaurant menu.", 400, "invalid_menu_item");
    }
    const price = menuItem.price;
    return {
      menuItemId: menuItem._id,
      name: menuItem.name,
      price,
      quantity: qty,
      note: String(item.note || "").trim(),
      totalAmount: qty * price,
    };
  });

  const calculatedTotal = items.reduce((acc, curr) => acc + curr.totalAmount, 0);
  const totalAmount = calculatedTotal;
  const orderType = data.orderType === "takeaway" ? "takeaway" : "dine-in";
  const orderCode = data.orderCode || data.orderNumber || generateOrderNumber(orderType);

  if (orderType === "takeaway") {
    const existingQueue = await QueueEntry.findOne({
      userId,
      status: { $in: ["waiting", "preparing", "ready", "notified"] },
    }).sort({ joinedAt: -1 });
    if (existingQueue) {
      throw new AppError(
        "You can only join one takeaway queue at a time. Leave your current queue before placing another takeaway order.",
        409,
        "already_in_queue",
        {
          queueCode: existingQueue.queueCode,
          entryId: existingQueue._id,
          restaurantId: existingQueue.restaurantId,
        },
      );
    }
  }

  let reservation = null;
  if (orderType === "dine-in") {
    if (!data.reservationId) {
      throw new AppError("A checked-in reservation is required for dine-in orders.", 400, "reservation_required");
    }
    reservation = await Reservation.findOne({
      _id: data.reservationId,
      userId,
      restaurantId: restaurant._id,
      status: "checked-in",
    }).lean();
    if (!reservation) {
      throw new AppError("Dine-in orders require your checked-in reservation at this restaurant.", 409, "reservation_not_checked_in");
    }
  }

  const order = await Order.create({
    orderCode,
    userId,
    restaurantId: restaurant._id,
    queueEntryId: data.queueEntryId || null,
    reservationId: reservation?._id || null,
    tableId: data.tableId || reservation?.tableId || null,
    items,
    totalAmount,
    status: "placed",
    orderType,
    notes: data.notes || data.note || data.specialInstructions || "",
  });

  if (orderType === "takeaway") {
    const activeCount = await QueueEntry.countDocuments({
      restaurantId: restaurant._id,
      status: { $in: ["waiting", "preparing", "ready"] },
    });
    const queueEntry = await QueueEntry.create({
      queueCode: `Q-${crypto.randomInt(1000, 10000)}`,
      userId,
      restaurantId: restaurant._id,
      orderId: order._id,
      position: activeCount + 1,
      status: "waiting",
      parcelToken: orderCode,
      orderSummary: items.map((item) => `${item.quantity} × ${item.name}`).join(", "),
    });
    order.queueEntryId = queueEntry._id;
    await order.save();
    await notify({
      userId,
      type: "queue",
      title: "You're in the takeaway queue",
      body: `${restaurant.name}: your parcel is in the queue.`,
      route: "/queue",
      data: { queueCode: queueEntry.queueCode },
      channel: "email",
    });
    emitQueueUpdated(restaurant._id, {
      queueEntryId: queueEntry._id,
      orderId: order._id,
      status: "waiting",
    });
  }

  await notifyRestaurantStaff(restaurant._id, {
    type: "order",
    title: "New Order Received",
    body: `New ${orderType === "takeaway" ? "takeaway" : "dine-in"} order ${orderCode} received (${items.length} items).`,
    route: "/staff",
    data: {
      orderId: String(order._id),
      orderCode,
      orderType,
    },
  });

  emitOrderUpdated(restaurant._id, {
    orderId: order._id,
    orderCode,
    status: order.status,
    orderType,
  });

  const populated = await Order.findById(order._id)
    .populate("userId", "name phone email")
    .populate("reservationId", "bookingId tableNumber date time")
    .lean();

  return {
    message: "Order placed successfully.",
    data: { order: shapeOrder(populated) },
  };
}

/**
 * Kitchen order list for staff view (Sobiyan).
 * Returns active kitchen orders: pending, confirmed, preparing, ready.
 */
async function listKitchenOrders(restaurantId, requestedStatus) {
  const filter = { restaurantId };

  if (requestedStatus) {
    if (!VALID_STATUSES.includes(requestedStatus)) {
      throw new AppError("Invalid status filter.", 400, "validation_error");
    }
    filter.status = requestedStatus;
  } else {
    filter.status = { $in: KITCHEN_ACTIVE_STATUSES };
  }

  const orders = await Order.find(filter)
    .sort({ createdAt: 1 })
    .populate("userId", "name phone email")
    .populate("reservationId", "bookingId tableNumber date time")
    .lean();

  return {
    data: orders.map(shapeOrder),
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * General order listing (with role scoping).
 */
async function listOrders(user, query = {}) {
  const filter = {};

  if (user.role === "customer") {
    filter.userId = user._id;
  } else if (["staff", "manager"].includes(user.role)) {
    if (query.restaurantId) {
      filter.restaurantId = query.restaurantId;
    } else if (user.restaurantId) {
      filter.restaurantId = user.restaurantId;
    }
  }

  if (query.status) {
    filter.status = query.status;
  }
  if (query.orderType) {
    filter.orderType = query.orderType;
  }

  const orders = await Order.find(filter)
    .sort({ createdAt: -1 })
    .populate("userId", "name phone email")
    .populate("reservationId", "bookingId tableNumber date time")
    .lean();

  return {
    data: orders.map(shapeOrder),
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Single order detail.
 */
async function getOrderById(orderId, user) {
  const order = await Order.findById(orderId)
    .populate("userId", "name phone email")
    .populate("reservationId", "bookingId tableNumber date time")
    .lean();

  if (!order) {
    throw new AppError("Order not found.", 404, "not_found");
  }

  const isOwner = String(order.userId?._id || order.userId) === String(user._id);
  const isStaff = ["staff", "manager"].includes(user.role);

  if (!isOwner && !isStaff) {
    throw new AppError("You do not have permission to view this order.", 403, "forbidden");
  }

  return {
    data: { order: shapeOrder(order) },
  };
}

/**
 * Update order status (Kitchen workflow: Sobiyan).
 * Status transitions: pending/confirmed -> preparing -> ready -> served / completed.
 */
async function updateOrderStatus(orderId, newStatus, staffUser) {
  if (!VALID_STATUSES.includes(newStatus)) {
    throw new AppError(
      `Invalid order status "${newStatus}". Allowed values: ${VALID_STATUSES.join(", ")}`,
      400,
      "validation_error",
    );
  }

  const order = await Order.findById(orderId);
  if (!order) {
    throw new AppError("Order not found.", 404, "not_found");
  }

  if (
    staffUser.restaurantId &&
    String(order.restaurantId) !== String(staffUser.restaurantId)
  ) {
    throw new AppError("Order belongs to another restaurant.", 403, "forbidden");
  }

  order.status = newStatus;
  await order.save();

  if (order.orderType === "takeaway" && order.queueEntryId) {
    const queueStatus = {
      preparing: "preparing",
      ready: "ready",
      collected: "collected",
      cancelled: "cancelled",
    }[newStatus];
    if (queueStatus) {
      const update = { status: queueStatus };
      if (queueStatus === "ready") update.readyAt = new Date();
      if (queueStatus === "collected") update.collectedAt = new Date();
      await QueueEntry.updateOne(
        { _id: order.queueEntryId, restaurantId: order.restaurantId },
        { $set: update },
      );
      emitQueueUpdated(order.restaurantId, {
        queueEntryId: order.queueEntryId,
        orderId: order._id,
        status: queueStatus,
      });
    }
  }

  if (newStatus === "ready" && order.orderType !== "takeaway") {
    const isTakeaway = order.orderType === "takeaway";
    const parcelRef = order.orderCode || "your order";
    const body = isTakeaway
      ? `Your takeaway order ${parcelRef} is ready for collection at the counter!`
      : `Your food order ${order.orderCode} is ready and is being served.`;

    await notify({
      userId: order.userId,
      type: "order",
      title: "Your Order is Ready!",
      body,
      route: "/orders",
      data: {
        orderId: String(order._id),
        orderCode: order.orderCode,
        status: order.status,
      },
      channel: "push",
    });

    emitOrderReady(order.restaurantId, {
      orderId: order._id,
      orderCode: order.orderCode,
      status: order.status,
      orderType: order.orderType,
      userId: String(order.userId),
    });
  }

  emitOrderUpdated(order.restaurantId, {
    orderId: order._id,
    orderCode: order.orderCode,
    status: order.status,
    orderType: order.orderType,
  });

  const updated = await Order.findById(order._id)
    .populate("userId", "name phone email")
    .populate("reservationId", "bookingId tableNumber date time")
    .lean();

  return {
    message: `Order status updated to ${newStatus}.`,
    data: { order: shapeOrder(updated) },
  };
}

/**
 * Delete / cancel order (Staff/manager).
 */
async function cancelOrder(orderId, customerUser) {
  const order = await Order.findOne({ _id: orderId, userId: customerUser._id });
  if (!order) throw new AppError("Order not found.", 404, "not_found");
  if (order.status !== "placed") {
    throw new AppError("Only placed orders can be cancelled.", 409, "order_not_cancellable");
  }
  order.status = "cancelled";
  await order.save();
  if (order.orderType === "takeaway" && order.queueEntryId) {
    await QueueEntry.updateOne(
      { _id: order.queueEntryId, userId: order.userId, restaurantId: order.restaurantId },
      { $set: { status: "cancelled", leftAt: new Date() } },
    );
    emitQueueUpdated(order.restaurantId, {
      queueEntryId: order.queueEntryId,
      orderId: order._id,
      status: "cancelled",
    });
  }
  emitOrderUpdated(order.restaurantId, { orderId: order._id, orderCode: order.orderCode, status: order.status });
  return { message: "Order cancelled successfully.", data: { order: shapeOrder(order.toObject()) } };
}

async function deleteOrder(orderId, staffUser) {
  const order = await Order.findById(orderId);
  if (!order) {
    throw new AppError("Order not found.", 404, "not_found");
  }

  if (
    staffUser.restaurantId &&
    String(order.restaurantId) !== String(staffUser.restaurantId)
  ) {
    throw new AppError("Order belongs to another restaurant.", 403, "forbidden");
  }

  order.status = "cancelled";
  await order.save();

  if (order.orderType === "takeaway" && order.queueEntryId) {
    await QueueEntry.updateOne(
      { _id: order.queueEntryId, restaurantId: order.restaurantId },
      { $set: { status: "cancelled", leftAt: new Date() } },
    );
    emitQueueUpdated(order.restaurantId, {
      queueEntryId: order.queueEntryId,
      orderId: order._id,
      status: "cancelled",
    });
  }

  emitOrderUpdated(order.restaurantId, {
    orderId: order._id,
    orderCode: order.orderCode,
    status: "cancelled",
  });

  return {
    message: "Order cancelled successfully.",
    data: { order: shapeOrder(order.toObject()) },
  };
}

module.exports = {
  createOrder,
  listKitchenOrders,
  listOrders,
  getOrderById,
  updateOrderStatus,
  deleteOrder,
  cancelOrder,
  VALID_STATUSES,
  KITCHEN_ACTIVE_STATUSES,
};
