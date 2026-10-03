const { AppError } = require("../utils/errors");

/**
 * Role-based access control middleware (spec §2).
 *
 * Usage:
 *   router.get("/", authenticate, requireRole("staff", "manager"), handler)
 *
 * `authenticate` must run first — `requireRole` reads `req.user.role`.
 * The app also hides each role's interface after login (spec §2), but the
 * API enforces it independently (spec NFR04).
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(
        new AppError("Authentication required.", 401, "unauthorized"),
      );
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(
          "You do not have permission to access this resource.",
          403,
          "forbidden",
        ),
      );
    }

    return next();
  };
}

/** Staff and manager both operate a single venue's floor. */
const requireVenueStaff = () => requireRole("staff", "manager");

/**
 * Managers may only touch the restaurant they own/represent.
 * Returns the restaurant id the requester is allowed to act on.
 */
function scopedRestaurantId(req) {
  if (req.user.role === "manager" && req.user.restaurantId) {
    return String(req.user.restaurantId);
  }
  return req.query.restaurantId || req.body.restaurantId || null;
}

module.exports = { requireRole, requireVenueStaff, scopedRestaurantId };
