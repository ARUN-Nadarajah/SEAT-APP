/**
 * Standard API response envelopes.
 *
 * Every endpoint replies with `{ status: "success" | "error", ... }` so the
 * mobile client can branch on a single field.
 */

function success(res, payload = {}, statusCode = 200) {
  return res.status(statusCode).json({
    status: "success",
    ...payload,
  });
}

function created(res, payload = {}) {
  return success(res, payload, 201);
}

function failure(res, statusCode, message, code = "error", details) {
  return res.status(statusCode).json({
    status: "error",
    message,
    code,
    ...(details !== undefined ? { details } : {}),
  });
}

/**
 * Paginated list helper.
 * @param {Array} items
 * @param {number} total
 * @param {object} meta extra fields (e.g. `lastUpdated`)
 */
function paginated(res, items, total, meta = {}) {
  return res.status(200).json({
    status: "success",
    data: items,
    total,
    ...meta,
  });
}

/** Timestamp helper so every data screen can show "Last updated" (NFR03). */
function now() {
  return new Date().toISOString();
}

module.exports = {
  success,
  created,
  failure,
  paginated,
  now,
};
