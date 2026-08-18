const db = require("./db");

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

  const messages = validTokens.map((token) => ({
    to: token,
    sound,
    title,
    body,
    data,
    badge,
  }));

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

module.exports = {
  sendExpoPushNotification,
  sendPushToUser,
};
