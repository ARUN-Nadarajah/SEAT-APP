/**
 * Time helpers shared by availability, queue ETA and slot generation.
 *
 * Times are always 24h "HH:mm" strings; dates are stored as UTC midnights
 * so a booking for 2026-10-04 compares cleanly regardless of server TZ.
 */

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "19:30" → 1170 (minutes since midnight). Returns null when malformed. */
function timeToMinutes(value) {
  const match = String(value || "").match(HHMM);
  if (!match) return null;
  return Number.parseInt(match[1], 10) * 60 + Number.parseInt(match[2], 10);
}

/** 1170 → "19:30". Clamps into the same day. */
function minutesToTime(total) {
  const normalised = ((Math.round(total) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalised / 60);
  const minutes = normalised % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** "19:30" → "7:30 PM" for display copy. */
function formatTime(value) {
  const minutes = timeToMinutes(value);
  if (minutes === null) return String(value || "");
  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const meridiem = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(mins).padStart(2, "0")} ${meridiem}`;
}

/** Accepts Date | "YYYY-MM-DD" | ISO string → Date at UTC midnight. */
function normalizeDate(value) {
  if (value instanceof Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }
  const raw = String(value || "").trim();
  const datePart = raw.slice(0, 10);
  const parsed = new Date(`${datePart}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

/** Date → "YYYY-MM-DD". */
function toDateString(value) {
  const date = value instanceof Date ? value : normalizeDate(value);
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

/** Today at UTC midnight — used as the default booking date. */
function today() {
  return normalizeDate(new Date().toISOString().slice(0, 10));
}

/**
 * Do two "HH:mm" ranges overlap?
 * A booking occupies [start, end); touching ranges do not collide.
 */
function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

/** "15-25" → "15–25 min" (en dash, spec copy). */
function rangeLabel(minMinutes, maxMinutes) {
  return `${minMinutes}–${maxMinutes} min`;
}

/**
 * Turn a single wait estimate into the "15–25 min" band used everywhere
 * in the UI (FR01, FR04). Bands step to 5 minutes and never show 0-0.
 */
function waitBand(estimatedMinutes) {
  const value = Math.max(0, Math.round(estimatedMinutes));
  if (value <= 5) return { min: 5, max: 10 };
  const min = Math.floor(value / 5) * 5;
  const max = Math.ceil((value * 1.25) / 5) * 5;
  return { min, max: Math.max(max, min + 5) };
}

module.exports = {
  HHMM,
  timeToMinutes,
  minutesToTime,
  formatTime,
  normalizeDate,
  toDateString,
  today,
  rangesOverlap,
  rangeLabel,
  waitBand,
};
