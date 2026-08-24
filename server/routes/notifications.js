const express = require("express");
const router = express.Router();
const db = require("../services/db");
const { authenticateToken } = require("../services/auth");
const { sendPushToUser } = require("../services/pushNotificationService");

// Register Expo Push Token for authenticated user
router.post("/api/notifications/register-token", authenticateToken, (req, res) => {
  const { token, deviceType = "ios" } = req.body;
  if (!token) {
    return res.status(400).json({ error: "Token is required" });
  }

  const userId = req.user.id;
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO push_tokens (user_id, token, device_type, updated_at) 
     VALUES (?, ?, ?, ?) 
     ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, updated_at = excluded.updated_at, device_type = excluded.device_type`,
    [userId, token, deviceType, now],
    (err) => {
      if (err) {
        console.error("Failed to save push token:", err);
        return res.status(500).json({ error: "DB_ERROR" });
      }
      res.json({ success: true, message: "Push token registered successfully" });
    },
  );
});

// Unregister an Expo Push Token (called on logout).
// Without this the device token stays bound to the account that last signed in,
// so every account ever used on a phone keeps receiving the 08:00 coach message.
router.post("/api/notifications/unregister-token", authenticateToken, (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ error: "Token is required" });
  }

  db.run(
    `DELETE FROM push_tokens WHERE token = ? AND user_id = ?`,
    [token, req.user.id],
    (err) => {
      if (err) {
        console.error("Failed to remove push token:", err);
        return res.status(500).json({ error: "DB_ERROR" });
      }
      res.json({ success: true, message: "Push token unregistered" });
    },
  );
});

// Test Push Notification endpoint
router.post("/api/notifications/test", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { title = "Rooka Coach", body = "Your workout is ready for today! ⚡" } = req.body;

  try {
    const result = await sendPushToUser(userId, {
      title,
      body,
      data: { url: "/(tabs)/coach" },
    });
    res.json({ success: true, result });
  } catch (err) {
    console.error("Failed to send test push notification:", err);
    res.status(500).json({ error: "NOTIFICATION_ERROR" });
  }
});

module.exports = router;
