/**
 * Availability + wait-time computation (FR01, FR04, spec §7).
 *
 * Pure functions that take plain data, so they are trivially unit-testable
 * and shared by the restaurant, reservation and queue services.
 */

const {
  timeToMinutes,
  minutesToTime,
  formatTime,
  rangesOverlap,
  waitBand,
} = require("./time");

/** Minutes a restaurant holds a table for one sitting. */
function seatingDuration(restaurant) {
  return restaurant?.averageSeatingMinutes || 75;
}

/** Reservation documents → [{ tableId, start, end }] in minutes. */
function indexReservations(reservations) {
  return reservations.map((reservation) => {
    const doc = reservation.toObject ? reservation.toObject() : reservation;
    const start = timeToMinutes(doc.time);
    const rawEnd = doc.endTime ? timeToMinutes(doc.endTime) : null;
    const end =
      rawEnd !== null ? rawEnd : (start === null ? null : start + 75);
    return {
      tableId: String(doc.tableId?._id || doc.tableId),
      start,
      end,
      status: doc.status,
    };
  });
}

/** Reservations that still hold a table (cancelled/no-show do not). */
function blockingReservations(reservations) {
  return indexReservations(reservations).filter(
    (entry) =>
      entry.start !== null &&
      entry.end !== null &&
      !["cancelled", "no-show"].includes(entry.status),
  );
}

/** Can `table` seat `partySize`? (Some slack over the exact party size.) */
function tableFits(table, partySize) {
  if (table.status === "maintenance" || table.isActive === false) return false;
  return table.capacity >= partySize;
}

/**
 * Tables free for [start, start + seatingDuration).
 * @returns {Array} free tables
 */
function freeTablesForSlot({ tables, partySize, startMinutes, conflicts, durationMinutes }) {
  const endMinutes = startMinutes + durationMinutes;
  const conflictTableIds = new Set(
    conflicts
      .filter((c) => rangesOverlap(startMinutes, endMinutes, c.start, c.end))
      .map((c) => c.tableId),
  );

  return tables.filter(
    (table) =>
      tableFits(table, partySize) && !conflictTableIds.has(String(table._id)),
  );
}

/**
 * Generate bookable time slots for a date, marking which are still free.
 *
 * Spec FR02 — the Reserve screen offers these directly, and when a slot
 * becomes unavailable mid-flow the API offers alternatives (spec §7).
 *
 * @returns {Array<{ time, timeLabel, available, availableTables }>}
 */
function generateTimeSlots({
  tables,
  reservations,
  openingTime,
  closingTime,
  intervalMinutes = 30,
  averageSeatingMinutes = 75,
  partySize = 2,
  now = new Date(),
  cutoffMinutes = 0,
  date,
}) {
  const openMinutes = timeToMinutes(openingTime);
  const closeMinutes = timeToMinutes(closingTime);
  if (openMinutes === null || closeMinutes === null) return [];

  const conflicts = blockingReservations(reservations);
  const interval = Math.max(5, intervalMinutes || 30);
  const duration = averageSeatingMinutes || 75;

  // Only allow booking slots that are still in the future (same-day cutoff).
  const nowMinutes = isSameUtcDay(date, now)
    ? now.getUTCHours() * 60 + now.getUTCMinutes() + cutoffMinutes
    : 0;

  const slots = [];
  for (let start = openMinutes; start + duration <= closeMinutes; start += interval) {
    if (start < nowMinutes) continue;

    const free = freeTablesForSlot({
      tables,
      partySize,
      startMinutes: start,
      conflicts,
      durationMinutes: duration,
    });

    slots.push({
      time: minutesToTime(start),
      timeLabel: formatTime(minutesToTime(start)),
      available: free.length > 0,
      availableTables: free.length,
      tableIds: free.map((t) => String(t._id)),
    });
  }

  return slots;
}

function isSameUtcDay(dateValue, other) {
  if (!dateValue) return false;
  const a = dateValue instanceof Date ? dateValue : new Date(dateValue);
  return (
    a.getUTCFullYear() === other.getUTCFullYear() &&
    a.getUTCMonth() === other.getUTCMonth() &&
    a.getUTCDate() === other.getUTCDate()
  );
}

/**
 * First time today that a party of `partySize` can be seated (FR01's
 * "Tonight from 7:00 PM"). Falls back to the opening time.
 */
function firstAvailableSlot(slots) {
  return slots.find((slot) => slot.available) || slots[0] || null;
}

/**
 * Wait-time estimate (spec §7):
 * "parties ahead × average seating duration for the restaurant".
 *
 * When tables are free the wait shrinks — a party only waits for the next
 * turnover, so we divide by the number of tables that can absorb demand.
 */
function estimateWaitMinutes({ partiesAhead, averageSeatingMinutes, freeTables = 0 }) {
  const ahead = Math.max(0, partiesAhead);
  if (ahead === 0) return 0;

  const duration = averageSeatingMinutes || 75;
  // At least one table's worth of throughput, never divide by zero.
  const throughput = Math.max(1, freeTables);
  return Math.round((ahead / throughput) * duration);
}

/**
 * Band + copy used across Explore, Queue join and Queue Tracker (FR04):
 * `{ minutes: 20, min: 15, max: 25, label: "15–25 min" }`
 */
function waitEstimate({ partiesAhead, averageSeatingMinutes, freeTables = 0 }) {
  const minutes = estimateWaitMinutes({
    partiesAhead,
    averageSeatingMinutes,
    freeTables,
  });
  const band = waitBand(minutes);
  return {
    minutes,
    min: band.min,
    max: band.max,
    label: `${band.min}–${band.max} min`,
  };
}

/** "15–25 min" band for the Explore card's walk-in wait (FR01). */
function walkInWait({ queueLength, averageSeatingMinutes, freeTables }) {
  return waitEstimate({
    partiesAhead: queueLength,
    averageSeatingMinutes,
    freeTables,
  });
}

/** "7:00 PM" label for the Explore card (FR01). */
function slotLabel(slot) {
  if (!slot) return "";
  return formatTime(slot.time);
}

module.exports = {
  seatingDuration,
  indexReservations,
  blockingReservations,
  tableFits,
  freeTablesForSlot,
  generateTimeSlots,
  firstAvailableSlot,
  estimateWaitMinutes,
  waitEstimate,
  walkInWait,
  slotLabel,
};
