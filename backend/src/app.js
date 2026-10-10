const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const { CORS_ORIGIN, TRUST_PROXY } = require("./config/environment");
const { apiLimiter, authLimiter } = require("./middleware/rateLimit.middleware");
const { notFound, errorHandler } = require("./middleware/error.middleware");

const routes = require("./routes");

const app = express();

// --- Proxy configuration (Render / reverse proxy support) ---
if (TRUST_PROXY !== undefined && TRUST_PROXY !== null && TRUST_PROXY !== "") {
  const trustVal =
    TRUST_PROXY === "true"
      ? true
      : TRUST_PROXY === "false"
        ? false
        : Number.isInteger(Number(TRUST_PROXY))
          ? Number(TRUST_PROXY)
          : TRUST_PROXY;
  app.set("trust proxy", trustVal);
} else {
  app.set("trust proxy", 1);
}

// --- Security baseline (spec §1: helmet, CORS, rate limiting) ---
app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN.split(",").map((o) => o.trim()),
    credentials: false,
  }),
);
app.use(express.json({ limit: "1mb" }));

// --- Health checks ---
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", service: "seat-app-backend" });
});

// --- Rate limiting ---
// Auth endpoints get the stricter bucket (credential/OTP abuse protection).
app.use("/api/auth", authLimiter);
app.use("/api", apiLimiter);

// --- Routes ---
app.use("/api", routes);

// --- Errors ---
app.use(notFound);
app.use(errorHandler);

module.exports = app;
