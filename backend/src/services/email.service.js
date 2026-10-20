const {
  NODE_ENV,
  MAILJET_API_KEY,
  MAILJET_SECRET_KEY,
  EMAIL_FROM,
} = require("../config/environment");

const MAILJET_SEND_ENDPOINT = "https://api.mailjet.com/v3.1/send";

/**
 * Retrieve Mailjet API credentials from runtime environment or loaded config.
 */
function getCredentials() {
  const apiKey = (
    process.env.MAILJET_API_KEY !== undefined
      ? process.env.MAILJET_API_KEY
      : MAILJET_API_KEY || ""
  ).trim();
  const secretKey = (
    process.env.MAILJET_SECRET_KEY !== undefined
      ? process.env.MAILJET_SECRET_KEY
      : MAILJET_SECRET_KEY || ""
  ).trim();
  return { apiKey, secretKey };
}

function getSenderEmail(customFrom) {
  if (customFrom) return customFrom;
  return process.env.EMAIL_FROM !== undefined ? process.env.EMAIL_FROM : EMAIL_FROM;
}

/**
 * Check whether valid Mailjet credentials are configured.
 */
function hasMailjetConfiguration() {
  const { apiKey, secretKey } = getCredentials();
  return Boolean(apiKey && secretKey);
}

/**
 * Parse a single email entry or string (e.g. "Name <email@example.com>" or "email@example.com").
 * Returns { Email, Name } compatible with Mailjet v3.1 API.
 */
function parseEmail(input, fallbackName = "") {
  if (!input) return null;

  if (typeof input === "object") {
    const email = (input.Email || input.email || "").trim();
    const name = (input.Name || input.name || fallbackName || "").trim();
    if (!email) return null;
    return {
      Email: email,
      ...(name ? { Name: name } : {}),
    };
  }

  const str = String(input).trim();
  const match = str.match(/^(?:(.*?)<)?([^<>@\s]+@[^<>@\s]+)>?$/);
  if (match) {
    const rawName = (match[1] || "").trim().replace(/^["']|["']$/g, "");
    const email = match[2].trim();
    const name = rawName || fallbackName;
    return {
      Email: email,
      ...(name ? { Name: name } : {}),
    };
  }

  return {
    Email: str,
    ...(fallbackName ? { Name: fallbackName } : {}),
  };
}

/**
 * Normalizes input recipients into an array of Mailjet recipient objects: [{ Email, Name? }].
 */
function formatRecipients(to, fallbackName = "") {
  const list = Array.isArray(to) ? to : [to];
  const formatted = [];
  for (const item of list) {
    const parsed = parseEmail(item, fallbackName);
    if (parsed && parsed.Email) {
      formatted.push(parsed);
    }
  }
  return formatted;
}

/**
 * Sends an email via Mailjet Send API v3.1 (HTTP Basic Auth).
 */
async function sendViaMailjet({ to, subject, text, html, name, from }) {
  const { apiKey, secretKey } = getCredentials();
  if (!apiKey || !secretKey) {
    throw new Error(
      "Mailjet API credentials (MAILJET_API_KEY and MAILJET_SECRET_KEY) are missing.",
    );
  }

  const recipients = formatRecipients(to, name);
  if (recipients.length === 0) {
    throw new Error("Cannot send email: No valid recipient email address provided.");
  }

  const sender = parseEmail(getSenderEmail(from), "SEAT App");
  if (!sender || !sender.Email) {
    throw new Error("Cannot send email: Invalid sender address configured.");
  }

  const message = {
    From: sender,
    To: recipients,
    Subject: subject || "(No Subject)",
  };

  if (text) {
    message.TextPart = text;
  }
  if (html) {
    message.HTMLPart = html;
  }
  // Mailjet v3.1 requires at least one content part
  if (!text && !html) {
    message.TextPart = subject || "";
  }

  const recipientSummary = recipients.map((r) => r.Email).join(", ");
  const authHeader = `Basic ${Buffer.from(`${apiKey}:${secretKey}`).toString("base64")}`;

  console.info(`[mailjet:send] Dispatching email to ${recipientSummary} | Subject: "${message.Subject}"`);

  let response;
  try {
    response = await fetch(MAILJET_SEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        Messages: [message],
      }),
    });
  } catch (networkError) {
    console.error(`[mailjet:error] Network request failed for ${recipientSummary}: ${networkError.message}`);
    throw new Error(`Mailjet network connection failed: ${networkError.message}`);
  }

  const rawBody = await response.text();
  let parsedBody = null;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    parsedBody = null;
  }

  if (!response.ok) {
    let errorDetail = "";
    if (parsedBody) {
      if (parsedBody.ErrorMessage) {
        errorDetail = `${parsedBody.ErrorMessage}${parsedBody.ErrorCode ? ` [${parsedBody.ErrorCode}]` : ""}`;
      } else if (Array.isArray(parsedBody.Messages) && parsedBody.Messages[0]?.Errors) {
        errorDetail = parsedBody.Messages[0].Errors.map(
          (err) => `${err.ErrorMessage}${err.ErrorCode ? ` [${err.ErrorCode}]` : ""}`,
        ).join("; ");
      } else {
        errorDetail = JSON.stringify(parsedBody);
      }
    } else {
      errorDetail = rawBody || response.statusText;
    }

    const errorMessage = `Mailjet API error (${response.status}): ${errorDetail}`;
    console.error(`[mailjet:error] ${errorMessage} (To: ${recipientSummary})`);
    throw new Error(errorMessage);
  }

  // Response status is 200, but message-level validation inside Messages array can still have failed
  const messageResult = parsedBody?.Messages?.[0];
  if (messageResult && messageResult.Status === "error") {
    const errorDetail =
      messageResult.Errors?.map(
        (err) => `${err.ErrorMessage}${err.ErrorCode ? ` [${err.ErrorCode}]` : ""}`,
      ).join("; ") || "Unknown Mailjet message error";
    const errorMessage = `Mailjet message rejected: ${errorDetail}`;
    console.error(`[mailjet:error] ${errorMessage} (To: ${recipientSummary})`);
    throw new Error(errorMessage);
  }

  const firstTo = messageResult?.To?.[0];
  const messageId = firstTo?.MessageID
    ? String(firstTo.MessageID)
    : firstTo?.MessageUUID || "mailjet-sent";

  console.info(`[mailjet:success] Delivered email to ${recipientSummary} | MessageID: ${messageId}`);

  return {
    messageId,
    status: "success",
    data: parsedBody,
  };
}

/**
 * Unified sendMail function.
 * Uses Mailjet HTTP API when credentials are present.
 * In development without credentials, logs to console for developer convenience.
 * In production without credentials, throws an error.
 */
async function sendMail({ to, subject, text, html, name, from }) {
  if (hasMailjetConfiguration()) {
    return sendViaMailjet({ to, subject, text, html, name, from });
  }

  const currentEnv = process.env.NODE_ENV || NODE_ENV;
  const isStrict = process.env.STRICT_EMAIL === "true";

  if (currentEnv === "production" || isStrict) {
    const errorMsg = "Mailjet API credentials (MAILJET_API_KEY, MAILJET_SECRET_KEY) are not configured.";
    console.error(`[mailjet:error] ${errorMsg}`);
    throw new Error(errorMsg);
  }

  const recipientSummary = Array.isArray(to) ? to.join(", ") : String(to);
  console.info(`[mailjet:fallback] Simulated email to ${recipientSummary} (Subject: "${subject}")`);
  if (text) {
    console.info(`[mailjet:fallback] Body: ${text}`);
  }

  return {
    messageId: "fallback-console",
    status: "simulated",
  };
}

module.exports = {
  sendMail,
  sendViaMailjet,
  hasMailjetConfiguration,
  formatRecipients,
  parseEmail,
};
