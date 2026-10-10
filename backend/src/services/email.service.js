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
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function getTransporter() {
  if (!hasSmtpConfiguration()) {
    return null;
  }

  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
      connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS || 5000,
      greetingTimeout: SMTP_CONNECTION_TIMEOUT_MS || 5000,
      socketTimeout: SMTP_CONNECTION_TIMEOUT_MS || 5000,
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
  if (NODE_ENV === "production" && process.env.STRICT_EMAIL === "true") {
    throw new Error("No email service configured (set RESEND_API_KEY or SMTP credentials).");
  }

  console.info(`[mail:fallback] To: ${to} | Subject: ${subject}`);
  if (text) {
    console.info(`[mail:fallback] Body: ${text}`);
  }
  return { messageId: "fallback-console" };
}

module.exports = {
  sendMail,
};

