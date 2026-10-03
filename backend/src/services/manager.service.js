const Reservation = require("../models/Reservation");
const QueueEntry = require("../models/QueueEntry");
const Table = require("../models/Table");

const { AppError } = require("../utils/errors");
const { normalizeDate, today, timeToMinutes, toDateString } = require("../utils/time");

/**
 * Manager dashboard (FR10 + spec §7).
 *
 * Returns the summary cards — Total reservations, No-shows, Avg wait —
 * plus an hourly series used by the simple chart.
 */
async function getStats({ restaurantId, date }) {
  if (!restaurantId) {
    throw new AppError("restaurantId is required.", 400, "validation_error");
  }

  const bookingDate = normalizeDate(date) || today();
  const start = bookingDate;
  const end = new Date(bookingDate.getTime() + 24 * 60 * 60 * 1000);

  const [reservations, queueEntries, tables, yesterdayCount] =
    await Promise.all([
      Reservation.find({
        restaurantId,
        date: { $gte: start, $lt: end },
      }).lean(),
      QueueEntry.find({
        restaurantId,
        joinedAt: { $gte: start, $lt: end },
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

  // Average wait = minutes between joining the queue and being seated.
  const seated = queueEntries.filter(
    (entry) => entry.seatedAt && entry.joinedAt,
  );
  const avgWaitMinutes = seated.length
    ? Math.round(
        seated.reduce(
          (total, entry) =>
            total + (new Date(entry.seatedAt) - new Date(entry.joinedAt)) / 60000,
          0,
        ) / seated.length,
      )
    : 0;

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

  const summary = {
    totalReservations,
    noShows,
    cancelled,
    checkedIn,
    confirmed,
    avgWaitMinutes,
    avgWaitLabel: `${avgWaitMinutes} min`,
    avgPartySize,
    walkIns: queueEntries.filter((entry) => entry.seatedAt).length,
    tableSummary,
    changeVsYesterday:
      totalReservations - yesterdayCount >= 0
        ? `+${totalReservations - yesterdayCount}`
        : String(totalReservations - yesterdayCount),
    date: toDateString(bookingDate),
    lastUpdated: new Date().toISOString(),
  };

  return { data: summary, hourly: buildHourlySeries(reservations, queueEntries) };
}

/**
 * Simple daily view: reservations + seated parties per hour (FR10).
 * Returned as a plain array so the app can draw a lightweight bar chart
 * without pulling in a charting library.
 */
function buildHourlySeries(reservations, queueEntries) {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: formatHour(hour),
    reservations: 0,
    seated: 0,
    waits: [],
  }));

  for (const reservation of reservations) {
    const hour = timeToMinutes(reservation.time);
    if (hour === null) continue;
    buckets[Math.min(23, Math.floor(hour / 60))].reservations += 1;
  }

  for (const entry of queueEntries) {
    if (!entry.seatedAt) continue;
    const hour = new Date(entry.seatedAt).getUTCHours();
    buckets[Math.min(23, hour)].seated += 1;
    if (entry.joinedAt) {
      buckets[Math.min(23, hour)].waits.push(
        (new Date(entry.seatedAt) - new Date(entry.joinedAt)) / 60000,
      );
    }
  }

  // Show the restaurant's busy window rather than a flat 0–23 axis.
  return buckets
    .map(({ waits, ...bucket }) => ({
      ...bucket,
      avgWait: waits.length
        ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length)
        : 0,
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
    const [reservations, seated] = await Promise.all([
      Reservation.countDocuments({
        restaurantId,
        date: { $gte: dayStart, $lt: dayEnd },
      }),
      QueueEntry.countDocuments({
        restaurantId,
        status: "seated",
        seatedAt: { $gte: dayStart, $lt: dayEnd },
      }),
    ]);

    rows.push({
      date: toDateString(dayStart),
      reservations,
      seated,
    });
  }

  return rows;
}

module.exports = { getStats, getDailyBreakdown, buildHourlySeries };
