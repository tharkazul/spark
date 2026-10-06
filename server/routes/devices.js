/**
 * Device-agnostic workout delivery.
 *
 * POST /api/devices/send-workouts
 *   body: { workouts?: Array }  (same shape as /api/sync-garmin)
 *
 * Sends the workouts to every cloud-connected device platform the user has
 * linked (currently Garmin Connect and Suunto). Apple Watch is handled on the
 * phone via WorkoutKit, so it is not part of this endpoint.
 */
const express = require('express');
const router = express.Router();
const db = require('../services/db');
const { authenticateToken } = require('../services/auth');
const { pushWorkoutsToGarmin } = require('./integrations');
const { pushWorkoutsToSuunto } = require('./suunto');

const dbGet = (sql, params = []) =>
  new Promise((resolve) => db.get(sql, params, (e, row) => resolve(e ? null : row)));

/** Cloud device providers. Add new watch platforms here. */
const PROVIDERS = [
  {
    id: 'garmin',
    name: 'Garmin',
    isConnected: async (userId) =>
      !!(await dbGet(`SELECT 1 AS ok FROM users WHERE id = ? AND garmin_username IS NOT NULL AND garmin_username != ''`, [userId])),
    push: pushWorkoutsToGarmin,
  },
  {
    id: 'suunto',
    name: 'Suunto',
    isConnected: async (userId) => !!(await dbGet(`SELECT 1 AS ok FROM suunto_tokens WHERE user_id = ?`, [userId])),
    push: pushWorkoutsToSuunto,
  },
];

router.post('/api/devices/send-workouts', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const selected = Array.isArray(req.body && req.body.workouts) ? req.body.workouts : null;

  const connected = [];
  for (const p of PROVIDERS) {
    if (await p.isConnected(userId)) connected.push(p);
  }

  if (connected.length === 0) {
    return res.json({ success: false, devices: [], message: 'No cloud-connected devices.' });
  }

  // Each provider gets its own copy of the payload and runs in parallel.
  const settled = await Promise.allSettled(
    connected.map((p) => p.push(userId, selected ? JSON.parse(JSON.stringify(selected)) : null)),
  );

  const devices = connected.map((p, i) => {
    const s = settled[i];
    if (s.status === 'rejected') {
      return { id: p.id, name: p.name, success: false, error: s.reason?.message || 'Send failed' };
    }
    const { status, body } = s.value;
    const ok = status >= 200 && status < 300 && body && body.success !== false;
    return {
      id: p.id,
      name: p.name,
      success: ok,
      syncedCount: body?.syncedCount ?? 0,
      message: body?.message,
      error: ok ? undefined : body?.details || body?.error || `HTTP ${status}`,
    };
  });

  res.json({ success: devices.some((d) => d.success), devices });
});

module.exports = router;
