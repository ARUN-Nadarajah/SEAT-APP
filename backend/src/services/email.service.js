const nodemailer = require("nodemailer");

const {
  NODE_ENV,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  EMAIL_FROM,
} = require("../config/environment");

let cachedTransporter = null;

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
    });
  }

  return cachedTransporter;
}

async function sendMail({ to, subject, text, html }) {
  const transporter = getTransporter();

  if (!transporter) {
    if (NODE_ENV === "production") {
      throw new Error("SMTP is not configured.");
    }

    console.info(`[mail:dev] To: ${to}`);
    console.info(`[mail:dev] Subject: ${subject}`);
    console.info(`[mail:dev] Text: ${text}`);
    return { messageId: "dev-console" };
  }

  return transporter.sendMail({
    from: EMAIL_FROM,
    to,
    subject,
    text,
    html,
  });
}

module.exports = {
  sendMail,
};
