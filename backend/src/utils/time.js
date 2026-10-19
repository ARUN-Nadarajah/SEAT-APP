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

/** Format Date into "YYYY-MM-DD" using local calendar components. */
function localDateString(d = new Date()) {
  const date = d instanceof Date ? d : new Date(d);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Today at UTC midnight — used as the default booking date. */
function today() {
  return normalizeDate(localDateString(new Date()));
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

const OPERATING_HOURS_OPEN = "08:00";
const OPERATING_HOURS_CLOSE = "22:00";
const OPERATING_HOURS_OPEN_MINUTES = 8 * 60; // 480 (8:00 AM)
const OPERATING_HOURS_CLOSE_MINUTES = 22 * 60; // 1320 (10:00 PM)
const TURNAROUND_BUFFER_MINUTES = 30;
const MIN_RESERVATION_MINUTES = 30;
const TIME_INCREMENT_MINUTES = 30;
const MAX_ADVANCE_DAYS = 30;

/**
 * Validates that start and end time adhere to:
 * - 24h format "HH:mm"
 * - 30-minute increments
 * - Within operating hours (8:00 AM - 10:00 PM)
 * - end > start
 * - duration >= 30 minutes
 */
function validateReservationTimeRange(startTime, endTime) {
  const startStr = String(startTime || "").trim();
  const endStr = String(endTime || "").trim();

  const startMinutes = timeToMinutes(startStr);
  const endMinutes = timeToMinutes(endStr);

  if (startMinutes === null) {
    const { AppError } = require("./errors");
    throw new AppError("Please choose a valid start time.", 400, "validation_error");
  }

  if (endMinutes === null) {
    const { AppError } = require("./errors");
    throw new AppError("Please choose a valid end time.", 400, "validation_error");
  }

  if (startMinutes % TIME_INCREMENT_MINUTES !== 0) {
    const { AppError } = require("./errors");
    throw new AppError(
      "Reservation start time must be in 30-minute increments.",
      400,
      "validation_error",
    );
  }

  if (endMinutes % TIME_INCREMENT_MINUTES !== 0) {
    const { AppError } = require("./errors");
    throw new AppError(
      "Reservation end time must be in 30-minute increments.",
      400,
      "validation_error",
    );
  }

  if (startMinutes < OPERATING_HOURS_OPEN_MINUTES) {
    const { AppError } = require("./errors");
    throw new AppError(
      `Reservations cannot start before operating hours (${formatTime(OPERATING_HOURS_OPEN)}).`,
      400,
      "validation_error",
    );
  }

  if (endMinutes > OPERATING_HOURS_CLOSE_MINUTES) {
    const { AppError } = require("./errors");
    throw new AppError(
      `Reservations must end by closing time (${formatTime(OPERATING_HOURS_CLOSE)}).`,
      400,
      "validation_error",
    );
  }

  if (endMinutes <= startMinutes) {
    const { AppError } = require("./errors");
    throw new AppError("Reservation end time must be after start time.", 400, "validation_error");
  }

  const durationMinutes = endMinutes - startMinutes;
  if (durationMinutes < MIN_RESERVATION_MINUTES) {
    const { AppError } = require("./errors");
    throw new AppError(
      `Minimum reservation duration is ${MIN_RESERVATION_MINUTES} minutes.`,
      400,
      "validation_error",
    );
  }

  return {
    startMinutes,
    endMinutes,
    durationMinutes,
    durationHours: durationMinutes / 60,
  };
}

/**
 * Validates reservation date:
 * - Cannot be in the past
 * - Cannot exceed 30 days in advance
 */
function validateReservationDate(dateValue, now = new Date()) {
  const date = normalizeDate(dateValue);
  if (!date) {
    const { AppError } = require("./errors");
    throw new AppError("Please choose a valid date (YYYY-MM-DD).", 400, "validation_error");
  }

  const todayMidnight = normalizeDate(localDateString(now));
  if (date.getTime() < todayMidnight.getTime()) {
    const { AppError } = require("./errors");
    throw new AppError("Bookings cannot be made in the past.", 400, "validation_error");
  }

  const maxDate = new Date(todayMidnight.getTime() + MAX_ADVANCE_DAYS * 24 * 60 * 60 * 1000);
  if (date.getTime() > maxDate.getTime()) {
    const { AppError } = require("./errors");
    throw new AppError(
      "Reservations can only be made up to 30 days in advance.",
      400,
      "validation_error",
    );
  }

  return date;
}

/** Combines UTC date midnight and "HH:mm" into a UTC Date. */
function combineDateAndTime(date, timeString) {
  const normDate = normalizeDate(date);
  if (!normDate) return null;
  const minutes = timeToMinutes(timeString);
  if (minutes === null) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return new Date(
    Date.UTC(
      normDate.getUTCFullYear(),
      normDate.getUTCMonth(),
      normDate.getUTCDate(),
      hours,
      mins,
      0,
      0,
    ),
  );
}

/**
 * Converts a date ("YYYY-MM-DD" or Date) and 24h time ("HH:mm") into a local Date.
 */
function parseLocalDateTime(dateValue, timeString) {
  let year;
  let month;
  let day;

  if (typeof dateValue === "string") {
    const trimmed = dateValue.trim().slice(0, 10);
    const parts = trimmed.split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    [year, month, day] = parts;
  } else if (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())) {
    if (
      dateValue.getUTCHours() === 0 &&
      dateValue.getUTCMinutes() === 0 &&
      dateValue.getUTCSeconds() === 0
    ) {
      year = dateValue.getUTCFullYear();
      month = dateValue.getUTCMonth() + 1;
      day = dateValue.getUTCDate();
    } else {
      year = dateValue.getFullYear();
      month = dateValue.getMonth() + 1;
      day = dateValue.getDate();
    }
  } else {
    return null;
  }

  const minutes = timeToMinutes(timeString);
  if (minutes === null) return null;

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  return new Date(year, month - 1, day, hours, mins, 0, 0);
}

/**
 * Checks if the reservation date and start time is strictly in the future.
 * Conceptually: selectedStartDateTime > currentDateTime
 */
function isFutureReservationDateTime(dateValue, timeString, now = new Date()) {
  const startDateTime = parseLocalDateTime(dateValue, timeString);
  if (!startDateTime) return false;
  const current = now instanceof Date ? now : new Date(now);
  return startDateTime.getTime() > current.getTime();
}

/**
 * Validates complete reservation date and time range:
 * - Date within [today, today + 30 days]
 * - Start & end times within operating hours (08:00 - 22:00) in 30-min steps
 * - end > start, duration >= 30 min
 * - selectedStartDateTime > currentDateTime (cannot book in the past)
 */
function validateReservationDateTime(dateValue, startTime, endTime, now = new Date()) {
  const date = validateReservationDate(dateValue, now);
  const timeRange = validateReservationTimeRange(startTime, endTime);

  if (!isFutureReservationDateTime(dateValue, startTime, now)) {
    const { AppError } = require("./errors");
    throw new AppError(
      "Reservation start time cannot be in the past.",
      400,
      "validation_error",
    );
  }

  return {
    date,
    ...timeRange,
  };
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
  OPERATING_HOURS_OPEN,
  OPERATING_HOURS_CLOSE,
  OPERATING_HOURS_OPEN_MINUTES,
  OPERATING_HOURS_CLOSE_MINUTES,
  TURNAROUND_BUFFER_MINUTES,
  MIN_RESERVATION_MINUTES,
  TIME_INCREMENT_MINUTES,
  MAX_ADVANCE_DAYS,
  validateReservationTimeRange,
  validateReservationDate,
  validateReservationDateTime,
  parseLocalDateTime,
  isFutureReservationDateTime,
  combineDateAndTime,
  localDateString,
};
