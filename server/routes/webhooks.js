const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../services/db');
const { upgradeToRookaPlus, downgradeToFree } = require('../services/subscriptionTier');

// Each RevenueCat event id is stored once, so retried deliveries are skipped.
db.run(
  `CREATE TABLE IF NOT EXISTS revenuecat_events (
     event_id TEXT PRIMARY KEY,
     type TEXT,
     app_user_id TEXT,
     received_at DATETIME DEFAULT CURRENT_TIMESTAMP
   )`,
  () => {
    // What the admin Discount page needs to count, per code, the athletes who
    // went on to subscribe: which store (PROMOTIONAL = a free-access grant, not
    // a sale), sandbox or production, and the offering they bought from. Added
    // once the table surely exists.
    for (const column of ['store TEXT', 'environment TEXT', 'presented_offering_id TEXT', 'product_id TEXT', 'period_type TEXT']) {
      db.run(`ALTER TABLE revenuecat_events ADD COLUMN ${column}`, () => {});
    }
  },
);

function secretMatches(header, secret) {
  const a = Buffer.from(String(header || ''));
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.post('/revenuecat', async (req, res) => {
  try {
    const secret = process.env.REVENUECAT_WEBHOOK_SECRET;

    // Without a configured secret anyone could grant themselves rooka+, so refuse everything.
    if (!secret) {
      console.error(`[RevenueCat Webhook] REVENUECAT_WEBHOOK_SECRET is not set; rejecting request.`);
      return res.status(503).json({ error: 'Webhook not configured' });
    }
    if (!secretMatches(req.headers.authorization, secret)) {
      console.warn(`[RevenueCat Webhook] Unauthorized attempt. Invalid or missing secret.`);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { event } = req.body;
    if (!event) {
      return res.status(400).json({ error: 'Missing event payload' });
    }
    if (!event.id) {
      return res.status(400).json({ error: 'Missing event id' });
    }

    const isNew = await new Promise((resolve, reject) => {
      db.run(
        `INSERT OR IGNORE INTO revenuecat_events
           (event_id, type, app_user_id, store, environment, presented_offering_id, product_id, period_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(event.id),
          event.type || null,
          event.app_user_id != null ? String(event.app_user_id) : null,
          event.store || null,
          event.environment || null,
          event.presented_offering_id || null,
          event.product_id || null,
          event.period_type || null,
        ],
        function (err) {
          if (err) return reject(err);
          resolve(this.changes > 0);
        },
      );
    });
    if (!isNew) {
      console.log(`[RevenueCat Webhook] Duplicate event ${event.id} skipped.`);
      return res.json({ received: true, duplicate: true });
    }

    const appUserId = event.app_user_id;
    const type = event.type;

    if (!appUserId) {
      return res.status(400).json({ error: 'Missing app_user_id' });
    }

    console.log(`[RevenueCat Webhook] Received ${type} for user ID ${appUserId}`);

    if (type === 'INITIAL_PURCHASE' || type === 'RENEWAL' || type === 'UNCANCELLATION') {
      upgradeToRookaPlus(appUserId)
        .then(() => console.log(`[RevenueCat Webhook] User ${appUserId} upgraded to rooka_plus.`))
        .catch((err) => console.error(`[RevenueCat Webhook] Error upgrading user ${appUserId}:`, err));
    } else if (type === 'EXPIRATION') {
      downgradeToFree(appUserId)
        .then(() => console.log(`[RevenueCat Webhook] User ${appUserId} downgraded to free.`))
        .catch((err) => console.error(`[RevenueCat Webhook] Error downgrading user ${appUserId}:`, err));
    }

    res.json({ received: true });
  } catch (error) {
    console.error(`[RevenueCat Webhook] Processing error:`, error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
