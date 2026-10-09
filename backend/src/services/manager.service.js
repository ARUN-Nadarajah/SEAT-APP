const Reservation = require("../models/Reservation");
const QueueEntry = require("../models/QueueEntry");
const Table = require("../models/Table");

const { AppError } = require("../utils/errors");
const { normalizeDate, today, timeToMinutes, toDateString } = require("../utils/time");
const { ACTIVE_STATUSES: ACTIVE_QUEUE_STATUSES } = require("./queue.service");

/**
 * Manager dashboard (FR10 + spec §7).
 *
 * The venue runs two independent tracks and the payload mirrors them:
 *   • Table reservations — booked parties, counted for the selected date.
 *   • Virtual takeaway queue — the live counter line. A queue entry is never
 *     "seated": guests collect their order at the counter, so wait time is
 *     joinedAt → collectedAt (not joinedAt → a nonexistent seatedAt).
 *
 * The `queue` block is always live (today + current line) — the date filter
 * only scopes the reservation figures and the hourly chart.
 */

function countWhere(entries, statuses) {
  return entries.filter((entry) => statuses.includes(entry.status)).length;
}

function average(values) {
  return values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : 0;
}

async function getStats({ restaurantId, date }) {
  if (!restaurantId) {
    throw new AppError("restaurantId is required.", 400, "validation_error");
  }

  const bookingDate = normalizeDate(date) || today();
  const start = bookingDate;
  const end = new Date(bookingDate.getTime() + 24 * 60 * 60 * 1000);
  const todayStart = today();
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const [
    reservations,
    dayQueueEntries,
    todayQueueEntries,
    activeQueue,
    tables,
    yesterdayCount,
  ] = await Promise.all([
    Reservation.find({
      restaurantId,
      date: { $gte: start, $lt: end },
    }).lean(),
    // Queue joins on the selected date — drives the chart's queue series.
    QueueEntry.find({
      restaurantId,
      joinedAt: { $gte: start, $lt: end },
    }).lean(),
    // Queue joins today — drives the live tracker cards.
    QueueEntry.find({
      restaurantId,
      joinedAt: { $gte: todayStart, $lt: todayEnd },
    }).lean(),
    // The live line, regardless of when entries joined.
    QueueEntry.find({
      restaurantId,
      status: { $in: ACTIVE_QUEUE_STATUSES },
    }).lean(),
    Table.find({ restaurantId }).lean(),
    Reservation.countDocuments({
      restaurantId,
      date: {
        $gte: new Date(start.getTime() - 24 * 60 * 60 * 1000),
        $lt: start,
      },
    }),
  ]);

  const totalReservations = reservations.length;
  const noShows = reservations.filter((r) => r.status === "no-show").length;
  const cancelled = reservations.filter((r) => r.status === "cancelled").length;
  const checkedIn = reservations.filter((r) => r.status === "checked-in").length;
  const confirmed = reservations.filter((r) => r.status === "confirmed").length;
  const completed = reservations.filter((r) => r.status === "completed").length;

  const avgPartySize = totalReservations
    ? Math.round(
        (reservations.reduce((sum, r) => sum + (r.partySize || 0), 0) /
          totalReservations) *
          10,
      ) / 10
    : 0;

  const tableSummary = tables.reduce(
    (acc, table) => {
      acc[table.status] = (acc[table.status] || 0) + 1;
      acc.total += 1;
      return acc;
    },
    { total: 0, available: 0, occupied: 0, reserved: 0, maintenance: 0 },
  );

  // --- Virtual queue tracker (live) -------------------------------------
  const collectedToday = todayQueueEntries.filter((entry) => entry.collectedAt);
  const pickupWaits = collectedToday
    .filter((entry) => entry.joinedAt)
    .map(
      (entry) =>
        (new Date(entry.collectedAt) - new Date(entry.joinedAt)) / 60000,
    );
  const avgPickupWaitMinutes = average(pickupWaits);

  // Longest posted estimate in the active line ≈ wait for the whole queue.
  const lineWaitMinutes = activeQueue.length
    ? Math.max(...activeQueue.map((entry) => entry.estimatedWait || 0))
    : 0;

  const queue = {
    joinedToday: todayQueueEntries.length,
    active: activeQueue.length,
    waiting: countWhere(activeQueue, ["waiting"]),
    preparing: countWhere(activeQueue, ["preparing"]),
    // "notified" is a legacy alias the queue service normalises to ready.
    ready: countWhere(activeQueue, ["ready", "notified"]),
    collectedToday: collectedToday.length,
    noShowsToday: countWhere(todayQueueEntries, ["no-show"]),
    cancelledToday: countWhere(todayQueueEntries, ["cancelled"]),
    avgPickupWaitMinutes,
    avgPickupWaitLabel: `${avgPickupWaitMinutes} min`,
    currentWaitLabel: `${lineWaitMinutes} min`,
  };

  const summary = {
    totalReservations,
    noShows,
    cancelled,
    checkedIn,
    confirmed,
    completed,
    avgPartySize,
    tableSummary,
    changeVsYesterday:
      totalReservations - yesterdayCount >= 0
        ? `+${totalReservations - yesterdayCount}`
        : String(totalReservations - yesterdayCount),
    date: toDateString(bookingDate),
    // Legacy FR10 alias — average wait now comes from the takeaway queue
    // (joined → collected); a queue never seats anyone.
    avgWaitMinutes: queue.avgPickupWaitMinutes,
    avgWaitLabel: queue.avgPickupWaitLabel,
    queue,
    lastUpdated: new Date().toISOString(),
  };

  return { data: summary, hourly: buildHourlySeries(reservations, dayQueueEntries) };
}

/**
 * Simple daily view: reservations + queue pickups per hour (FR10).
 * Returned as a plain array so the app can draw a lightweight bar chart
 * without pulling in a charting library.
 */
function buildHourlySeries(reservations, queueEntries) {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: formatHour(hour),
    reservations: 0,
    queueCompleted: 0,
    waits: [],
  }));

  for (const reservation of reservations) {
    const hour = timeToMinutes(reservation.time);
    if (hour === null) continue;
    buckets[Math.min(23, Math.floor(hour / 60))].reservations += 1;
  }

  for (const entry of queueEntries) {
    if (!entry.collectedAt) continue;
    const hour = new Date(entry.collectedAt).getUTCHours();
    buckets[Math.min(23, hour)].queueCompleted += 1;
    if (entry.joinedAt) {
      buckets[Math.min(23, hour)].waits.push(
        (new Date(entry.collectedAt) - new Date(entry.joinedAt)) / 60000,
      );
    }
  }

  // Show the restaurant's busy window rather than a flat 0–23 axis.
  return buckets
    .map(({ waits, ...bucket }) => ({
      ...bucket,
      avgWait: average(waits),
    }))
    .filter((bucket) => bucket.hour >= 10 && bucket.hour <= 23);
}

function formatHour(hour) {
  const meridiem = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${meridiem}`;
}

/** Week-at-a-glance used by the manager date filter's "This week" mode. */
async function getDailyBreakdown(restaurantId, fromDate, days = 7) {
  const start = normalizeDate(fromDate) || today();

  const rows = [];
  for (let index = 0; index < days; index += 1) {
    const dayStart = new Date(start.getTime() + index * 24 * 60 * 60 * 1000);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    // eslint-disable-next-line no-await-in-loop
    const [reservations, queueCompleted] = await Promise.all([
      Reservation.countDocuments({
        restaurantId,
        date: { $gte: dayStart, $lt: dayEnd },
      }),
      QueueEntry.countDocuments({
        restaurantId,
        collectedAt: { $gte: dayStart, $lt: dayEnd },
      }),
    ]);

    rows.push({
      date: toDateString(dayStart),
      reservations,
      queueCompleted,
    });
  }

  return rows;
}

module.exports = { getStats, getDailyBreakdown, buildHourlySeries };
