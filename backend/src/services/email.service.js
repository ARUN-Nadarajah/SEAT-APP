const nodemailer = require("nodemailer");

const {
  NODE_ENV,
  RESEND_API_KEY,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  SMTP_CONNECTION_TIMEOUT_MS,
  EMAIL_FROM,
} = require("../config/environment");

let cachedTransporter = null;

function hasResendConfiguration() {
  return Boolean(RESEND_API_KEY);
}

function hasSmtpConfiguration() {
  const host = process.env.SMTP_HOST || SMTP_HOST;
  const user = process.env.SMTP_USER || SMTP_USER;
  const pass = process.env.SMTP_PASS || SMTP_PASS;
  return Boolean(host && user && pass);
}

function getTransporter() {
  if (!hasSmtpConfiguration()) {
    return null;
  }

  if (!cachedTransporter) {
    const host = process.env.SMTP_HOST || SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || SMTP_PORT) || 587;
    // For port 587, STARTTLS requires secure: false.
    const isPort587 = port === 587;
    const secure = isPort587
      ? false
      : port === 465 || process.env.SMTP_SECURE === "true" || SMTP_SECURE === true;
    const user = process.env.SMTP_USER || SMTP_USER;
    const pass = process.env.SMTP_PASS || SMTP_PASS;

    cachedTransporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
      family: 4, // Force IPv4 to prevent ENETUNREACH errors on hosts without IPv6 routing
      connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || SMTP_CONNECTION_TIMEOUT_MS) || 10000,
      greetingTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || SMTP_CONNECTION_TIMEOUT_MS) || 10000,
      socketTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || SMTP_CONNECTION_TIMEOUT_MS) || 10000,
    });
  }

  return cachedTransporter;
}

async function sendViaResend({ to, subject, text, html }) {
  const fromAddress = EMAIL_FROM.includes("<") ? EMAIL_FROM : `Seat App <${EMAIL_FROM}>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
      to: Array.isArray(to) ? to : [to],
      subject,
      text: text || undefined,
      html: html || undefined,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Resend API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return { messageId: data.id };
}

async function sendMail({ to, subject, text, html }) {
  // 1. Prefer HTTP-based email (Resend) - immune to Render free-tier SMTP port blocking
  if (hasResendConfiguration()) {
    return sendViaResend({ to, subject, text, html });
  }

  // 2. Nodemailer SMTP (e.g. custom relay or paid plan where ports 465/587 are open)
  const transporter = getTransporter();

  if (transporter) {
    return transporter.sendMail({
      from: EMAIL_FROM,
      to,
      subject,
      text,
      html,
    });
  }

  // 3. Fallback when neither provider is configured
  if ((process.env.NODE_ENV || NODE_ENV) === "production" && process.env.STRICT_EMAIL === "true") {
    throw new Error("No email service configured (set RESEND_API_KEY or SMTP credentials).");
  }

  if ((process.env.NODE_ENV || NODE_ENV) !== "production") {
    console.info(`[mail:fallback] To: ${to} | Subject: ${subject}`);
    if (text) {
      console.info(`[mail:fallback] Body: ${text}`);
    }
  } else {
    console.info(`[mail:fallback] Simulated email to ${to} (Subject: ${subject})`);
  }
  return { messageId: "fallback-console" };
}

module.exports = {
  sendMail,
};

