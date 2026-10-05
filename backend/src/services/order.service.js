const crypto = require("crypto");

const Order = require("../models/Order");
const Restaurant = require("../models/Restaurant");
const Reservation = require("../models/Reservation");
const User = require("../models/User");

const { AppError } = require("../utils/errors");
const { notify, notifyRestaurantStaff } = require("./notification.service");
const { emitOrderReady, emitOrderUpdated } = require("../realtime/events");

const VALID_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "served",
  "completed",
  "cancelled",
];

const KITCHEN_ACTIVE_STATUSES = ["pending", "confirmed", "preparing", "ready"];

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
    orderNumber:
      order.orderNumber ||
      `${order.orderType === "takeaway" ? "P" : "ORD"}-${String(order._id).slice(-4).toUpperCase()}`,
    restaurantId: order.restaurantId,
    orderType: order.orderType || "dine_in",
    status: order.status,
    tableNumber:
      order.tableNumber || (reservation && reservation.tableNumber ? reservation.tableNumber : ""),
    parcelToken: order.parcelToken || (order.orderType === "takeaway" ? order.orderNumber : ""),
    items: (order.items || []).map((item) => ({
      foodId: item.foodId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
    })),
    totalAmount: order.totalAmount,
    specialInstructions: order.specialInstructions || "",
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

  const items = data.items.map((item) => {
    const qty = Number(item.quantity) || 1;
    const price = Number(item.unitPrice) || 0;
    return {
      foodId: item.foodId,
      name: String(item.name || "Item").trim(),
      quantity: qty,
      unitPrice: price,
      subtotal: Number(item.subtotal) || qty * price,
    };
  });

  const calculatedTotal = items.reduce((acc, curr) => acc + curr.subtotal, 0);
  const totalAmount = data.totalAmount !== undefined ? Number(data.totalAmount) : calculatedTotal;
  const orderType = data.orderType === "takeaway" ? "takeaway" : "dine_in";
  const orderNumber = data.orderNumber || generateOrderNumber(orderType);
  const parcelToken = orderType === "takeaway" ? data.parcelToken || orderNumber : "";

  const order = await Order.create({
    orderNumber,
    userId,
    restaurantId: restaurant._id,
    reservationId: data.reservationId || null,
    tableNumber: data.tableNumber || "",
    parcelToken,
    items,
    totalAmount,
    status: "pending",
    orderType,
    specialInstructions: data.specialInstructions || "",
  });

  await notifyRestaurantStaff(restaurant._id, {
    type: "order",
    title: "New Order Received",
    body: `New ${orderType === "takeaway" ? "takeaway" : "dine-in"} order ${orderNumber} received (${items.length} items).`,
    route: "/staff",
    data: {
      orderId: String(order._id),
      orderNumber,
      orderType,
    },
  });

  emitOrderUpdated(restaurant._id, {
    orderId: order._id,
    orderNumber,
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

  if (newStatus === "ready") {
    const isTakeaway = order.orderType === "takeaway";
    const parcelRef = order.parcelToken || order.orderNumber || "your order";
    const body = isTakeaway
      ? `Your takeaway order ${parcelRef} is ready for collection at the counter!`
      : `Your food order ${order.orderNumber} is ready and is being served to table ${order.tableNumber || "assigned"}.`;

    await notify({
      userId: order.userId,
      type: "order",
      title: "Your Order is Ready!",
      body,
      route: "/orders",
      data: {
        orderId: String(order._id),
        orderNumber: order.orderNumber,
        status: order.status,
      },
      channel: "push",
    });

    emitOrderReady(order.restaurantId, {
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      orderType: order.orderType,
      userId: String(order.userId),
    });
  }

  emitOrderUpdated(order.restaurantId, {
    orderId: order._id,
    orderNumber: order.orderNumber,
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

  emitOrderUpdated(order.restaurantId, {
    orderId: order._id,
    orderNumber: order.orderNumber,
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
  VALID_STATUSES,
  KITCHEN_ACTIVE_STATUSES,
};

