const User = require("../models/User");
const { AppError } = require("../utils/errors");
const { verifyToken } = require("../utils/generateToken");

function extractBearerToken(authorizationHeader) {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

async function authenticate(req, res, next) {
  try {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      throw new AppError("Authentication required.", 401, "unauthorized");
    }

    const payload = verifyToken(token);
    const userId = payload.sub || payload.userId;
    const user = await User.findById(userId);

    if (!user || !user.isActive) {
      throw new AppError(
        "Invalid authentication session.",
        401,
        "unauthorized",
      );
    }

    req.user = user;
    req.auth = payload;
    next();
  } catch (error) {
    next(
      error instanceof AppError
        ? error
        : new AppError("Invalid authentication token.", 401, "unauthorized"),
    );
  }
}

function authorizeRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
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

module.exports = {
  authenticate,
  authorizeRoles,
};
