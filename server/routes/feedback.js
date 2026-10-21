/**
 * Feedback for the rooka team.
 *
 * When an athlete's chat message mentions feedback, the app asks whether it is
 * meant for the team. On yes it comes here instead of going to the AI coach: it
 * is stored and emailed to rutger@rooka.io with any attached images. No AI is
 * involved, so this route does not need AI consent.
 */
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const router = express.Router();
const db = require("../services/db");
const { authenticateToken } = require("../services/auth");
const { userLimits } = require("../services/rateLimit");
const { sendFeedbackEmail } = require("../services/emailService");

const MAX_MESSAGE_LENGTH = 5000;
const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_DATA_URL = /^data:image\/(jpeg|jpg|png|webp|heic|gif);base64,(.+)$/;
const UPLOAD_DIR = path.join(__dirname, "../secure_uploads/feedback");

const dbGet = (sql, params) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));
const dbRun = (sql, params) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    }),
  );

const shortString = (v, max = 40) => (typeof v === "string" ? v.slice(0, max) : undefined);

router.post("/api/feedback", authenticateToken, userLimits.feedback, async (req, res) => {
  const message = typeof req.body.message === "string" ? req.body.message.trim().slice(0, MAX_MESSAGE_LENGTH) : "";
  const images = Array.isArray(req.body.imagesBase64) ? req.body.imagesBase64 : [];
  if (!message && images.length === 0) return res.status(400).json({ error: "Feedback is empty." });
  if (images.length > MAX_IMAGES) return res.status(400).json({ error: `At most ${MAX_IMAGES} images per feedback.` });

  const decoded = [];
  for (const dataUrl of images) {
    const match = typeof dataUrl === "string" && dataUrl.match(IMAGE_DATA_URL);
    if (!match) return res.status(400).json({ error: "Unsupported image." });
    const buffer = Buffer.from(match[2], "base64");
    if (buffer.length > MAX_IMAGE_BYTES) return res.status(400).json({ error: "Image too large." });
    decoded.push({ ext: match[1] === "jpg" ? "jpeg" : match[1], buffer });
  }

  const meta = {
    platform: shortString(req.body.platform, 20),
    osVersion: shortString(req.body.osVersion, 20),
    appVersion: shortString(req.body.appVersion, 20),
  };

  try {
    const athlete = await dbGet(`SELECT id, username, email, language, subscription_tier FROM users WHERE id = ?`, [req.user.id]);
    if (!athlete) return res.status(404).json({ error: "User not found." });

    const imagePaths = [];
    if (decoded.length > 0) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      for (const { ext, buffer } of decoded) {
        const filePath = path.join(UPLOAD_DIR, `fb_${req.user.id}_${crypto.randomUUID()}.${ext}`);
        fs.writeFileSync(filePath, buffer);
        imagePaths.push(filePath);
      }
    }

    const { lastID: feedbackId } = await dbRun(
      `INSERT INTO feedback (user_id, message, image_paths, meta_json) VALUES (?, ?, ?, ?)`,
      [req.user.id, message, imagePaths.length ? JSON.stringify(imagePaths.map((p) => path.basename(p))) : null, JSON.stringify(meta)],
    );

    // Stored, so the athlete's feedback is safe even if the email fails.
    try {
      await sendFeedbackEmail({ feedbackId, athlete, message, imagePaths, meta });
      await dbRun(`UPDATE feedback SET emailed = 1 WHERE id = ?`, [feedbackId]);
    } catch (mailErr) {
      console.error(`Feedback #${feedbackId} stored but email failed:`, mailErr.message);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Feedback error:", err);
    res.status(500).json({ error: "Could not send feedback." });
  }
});

module.exports = router;
