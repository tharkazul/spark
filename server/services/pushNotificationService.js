const db = require("./db");

// Expo only learns that a token is dead once Apple/Google refuse the message,
// which it reports in the push *receipt*, not in the ticket returned by /send.
// Every ticket id is kept in push_receipts_pending; processPushReceipts() asks
// for the receipts once they are RECEIPT_DELAY_MS old and deletes the
// push_tokens rows Expo reports as DeviceNotRegistered. Without this, every
// reinstall left a dead token behind on the account.
const RECEIPT_DELAY_MS = 15 * 60 * 1000;
// Expo keeps receipts for 24 hours; a ticket still unanswered after that never will be.
const RECEIPT_EXPIRY_MS = 24 * 60 * 60 * 1000;
const RECEIPT_BATCH_SIZE = 1000; // max ids per getReceipts request

const run = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    }),
  );
const all = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || []))),
  );

async function removeDeadToken(token) {
  const res = await run(`DELETE FROM push_tokens WHERE token = ?`, [token]);
  if (res.changes > 0) console.log("[Push] Removed unregistered push token");
}

// Tickets come back in the same order as the messages that were sent.
async function recordTickets(tokens, tickets) {
  if (!Array.isArray(tickets)) return;
  const now = Date.now();
  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i];
    const token = ticket?.details?.expoPushToken || tokens[i];
    if (!ticket || !token) continue;
    try {
      if (ticket.status === "ok" && ticket.id) {
        await run(
          `INSERT OR IGNORE INTO push_receipts_pending (ticket_id, token, sent_at) VALUES (?, ?, ?)`,
          [ticket.id, token, now],
        );
      } else if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
        await removeDeadToken(token);
      }
    } catch (err) {
      console.error("[Push] Could not record push ticket:", err.message);
    }
  }
}

/**
 * Dispatches push notification to Expo Push API
 */
async function sendExpoPushNotification({ to, title, body, data = {}, sound = "default", badge }) {
  if (!to) return;
  const tokens = Array.isArray(to) ? to : [to];
  const validTokens = tokens.filter(
    (t) =>
      typeof t === "string" &&
      (t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken[")),
  );

  if (validTokens.length === 0) return;

  const messages = validTokens.map((token) => {
    const msg = {
      to: token,
      sound,
      title,
      body,
      data,
    };
    if (typeof badge === "number") {
      msg.badge = badge;
    }
    return msg;
  });

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });
    const result = await response.json();
    await recordTickets(validTokens, result?.data);
    return result;
  } catch (err) {
    console.error("Error sending push notification via Expo API:", err);
  }
}

/**
 * Look up all registered push tokens for a given user ID and send push notification
 */
async function sendPushToUser(userId, { title, body, data = {}, sound = "default", badge }) {
  if (!userId) return null;
  return new Promise((resolve) => {
    db.all(
      `SELECT token FROM push_tokens WHERE user_id = ?`,
      [userId],
      async (err, rows) => {
        if (err || !rows || rows.length === 0) {
          return resolve(null);
        }
        const tokens = rows.map((r) => r.token);
        const result = await sendExpoPushNotification({
          to: tokens,
          title,
          body,
          data,
          sound,
          badge,
        });
        resolve(result);
      },
    );
  });
}

/**
 * Fetches the receipts of tickets that are at least RECEIPT_DELAY_MS old and
 * deletes tokens Expo reports as DeviceNotRegistered. Runs from a cron job in
 * server.js; `now` is injectable for tests.
 */
async function processPushReceipts({ now = Date.now() } = {}) {
  const pending = await all(
    `SELECT ticket_id, token, sent_at FROM push_receipts_pending WHERE sent_at <= ? ORDER BY sent_at`,
    [now - RECEIPT_DELAY_MS],
  );
  const summary = { checked: 0, removed: 0, expired: 0 };
  if (pending.length === 0) return summary;

  for (let i = 0; i < pending.length; i += RECEIPT_BATCH_SIZE) {
    const batch = pending.slice(i, i + RECEIPT_BATCH_SIZE);
    let receipts;
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: batch.map((p) => p.ticket_id) }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      receipts = (await response.json())?.data || {};
    } catch (err) {
      // Keep the tickets; the next run tries again.
      console.error("[Push] Fetching push receipts failed:", err.message);
      continue;
    }

    for (const p of batch) {
      const receipt = receipts[p.ticket_id];
      if (!receipt) {
        // Not ready yet; give up once Expo no longer has it.
        if (now - p.sent_at > RECEIPT_EXPIRY_MS) {
          await run(`DELETE FROM push_receipts_pending WHERE ticket_id = ?`, [p.ticket_id]);
          summary.expired++;
        }
        continue;
      }
      summary.checked++;
      if (receipt.status === "error") {
        if (receipt.details?.error === "DeviceNotRegistered") {
          await removeDeadToken(p.token);
          summary.removed++;
        } else {
          // Expo's message says what is wrong (credentials, a token from another build, ...);
          // the code alone ("DeveloperError") doesn't.
          const owner = await all(`SELECT user_id, device_type, created_at FROM push_tokens WHERE token = ?`, [p.token]);
          const who = owner[0] ? `user ${owner[0].user_id}, ${owner[0].device_type} token from ${owner[0].created_at}` : "token no longer stored";
          console.warn(`[Push] Push receipt error (${who}): ${receipt.details?.error || "unknown"} - ${receipt.message || "no message"}`);
        }
      }
      await run(`DELETE FROM push_receipts_pending WHERE ticket_id = ?`, [p.ticket_id]);
    }
  }
  return summary;
}

module.exports = {
  sendExpoPushNotification,
  sendPushToUser,
  processPushReceipts,
  RECEIPT_DELAY_MS,
};
