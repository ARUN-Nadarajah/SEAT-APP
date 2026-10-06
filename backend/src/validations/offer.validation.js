const { AppError } = require("../utils/errors");
const { assertIntRange } = require("../middleware/validation.middleware");

function dateOnly(value, fieldName) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(`${fieldName} must be a valid date (YYYY-MM-DD).`, 400, "validation_error");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new AppError(`${fieldName} must be a valid date (YYYY-MM-DD).`, 400, "validation_error");
  }
  return date;
}

function validateOffer(body = {}) {
  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim();
  const rawValue = String(body.value || "").trim();
  const numericValue = Number(rawValue.replace(/[^\d.]/g, ""));
  const value = body.type === "Value"
    ? `Rs. ${numericValue}`
    : `${numericValue}%`;
  if (!title || !description || !value) {
    throw new AppError("Title, description and value are required.", 400, "validation_error");
  }
  if (!["Percentage", "Value"].includes(body.type)) {
    throw new AppError("Offer type must be Percentage or Value.", 400, "validation_error");
  }
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    throw new AppError("Discount value must be greater than 0.", 400, "validation_error");
  }
  const startDate = dateOnly(body.startDate, "Start date");
  const endDate = dateOnly(body.endDate, "End date");
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (startDate < today) {
    throw new AppError(
      "Start date must be today or a future date.",
      400,
      "validation_error",
    );
  }
  endDate.setUTCHours(23, 59, 59, 999);
  if (endDate < startDate) {
    throw new AppError("End date must be on or after the start date.", 400, "validation_error");
  }
  const image = typeof body.image === "string" ? body.image.trim() : "";
  if (image && !/^https?:\/\/\S+$/i.test(image)) {
    throw new AppError(
      "Image must be a public URL beginning with http:// or https://.",
      400,
      "validation_error",
    );
  }
  return {
    title,
    description,
    type: body.type,
    value,
    requiredReservations: assertIntRange(body.requiredReservations, {
      min: 0,
      max: 100000,
      fieldName: "Required reservations",
    }),
    active: body.active !== false,
    image,
    startDate,
    endDate,
  };
}

module.exports = { validateOffer };
