const db = require("./db");
const zones = require("./zones");

/**
 * Resolves an athlete's zone tables, with a deliberate fallback chain:
 *
 *   1. a table saved for that exact sport   (Swim HR differs from Run HR)
 *   2. the athlete's 'default' table
 *   3. tables derived on the fly from max HR / FTP
 *   4. nothing — the caller then scores at a neutral multiplier
 *
 * Step 3 matters: an athlete who has given their date of birth gets sensible
 * zones immediately, without having to visit a settings screen first.
 */

// The onboarding baseline fields are free-text labels, so the same value can
// arrive under several spellings. Match generously, write back canonically.
const METRIC_ALIASES = {
  max_hr: ["max_hr", "maxhr", "max hr", "max heart rate", "maximum hr", "hr max"],
  resting_hr: ["resting_hr", "restinghr", "resting hr", "rest hr"],
  ftp: ["ftp", "ftp (watts)", "ftp watts", "functional threshold power"],
};

function normaliseMetricKey(raw) {
  const k = String(raw || "").trim().toLowerCase();
  for (const [canonical, aliases] of Object.entries(METRIC_ALIASES)) {
    if (aliases.includes(k)) return canonical;
  }
  return null;
}

function getAthleteMetrics(userId) {
  return new Promise((resolve) => {
    db.all(
      `SELECT metric, value FROM athlete_metrics WHERE user_id = ?`,
      [userId],
      (err, rows) => {
        const out = {};
        if (!err && rows) {
          for (const r of rows) {
            const key = normaliseMetricKey(r.metric);
            const num = parseFloat(String(r.value).replace(/[^0-9.]/g, ""));
            if (key && !isNaN(num) && num > 0) out[key] = num;
          }
        }
        resolve(out);
      }
    );
  });
}

function getSavedZones(userId) {
  return new Promise((resolve) => {
    db.all(
      `SELECT sport, kind, zones_json, source FROM athlete_zones WHERE user_id = ?`,
      [userId],
      (err, rows) => {
        const out = {};
        if (!err && rows) {
          for (const r of rows) {
            try {
              out[`${r.sport}:${r.kind}`] = JSON.parse(r.zones_json);
            } catch (_) {}
          }
        }
        resolve(out);
      }
    );
  });
}

function getUser(userId) {
  return new Promise((resolve) => {
    db.get(
      `SELECT date_of_birth FROM users WHERE id = ?`,
      [userId],
      (err, row) => resolve(err ? null : row)
    );
  });
}

/**
 * @returns {{ hrZones: array|null, powerZones: array|null, maxHr: number|null, ftp: number|null }}
 */
async function resolveZonesForUser(userId, sport = "default") {
  const [saved, metrics, user] = await Promise.all([
    getSavedZones(userId),
    getAthleteMetrics(userId),
    getUser(userId),
  ]);

  const pick = (kind) =>
    saved[`${sport}:${kind}`] || saved[`default:${kind}`] || null;

  let hrZones = pick("hr");
  let powerZones = pick("power");

  // Which table the power zones actually came from, so callers can tell a
  // sport's own table apart from the cycling-FTP default. Null means nothing
  // was saved and the bands below are derived from FTP.
  const powerZonesSport = saved[`${sport}:power`]
    ? sport
    : saved[`default:power`]
      ? "default"
      : null;

  if (!hrZones) {
    const age = zones.ageFromDateOfBirth(user && user.date_of_birth);
    const maxHr = metrics.max_hr || zones.maxHrFromAge(age) || 190;
    hrZones = zones.buildHrZones(maxHr);
  }
  if (!powerZones) {
    powerZones = zones.buildPowerZones(metrics.ftp);
  }

  return {
    hrZones,
    powerZones,
    powerZonesSport,
    maxHr: metrics.max_hr || zones.maxHrFromAge(zones.ageFromDateOfBirth(user && user.date_of_birth)) || null,
    ftp: metrics.ftp || null,
  };
}

function saveZones(userId, sport, kind, zonesArray, source = "manual") {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO athlete_zones (user_id, sport, kind, zones_json, source, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, sport, kind) DO UPDATE SET
         zones_json = excluded.zones_json,
         source = excluded.source,
         updated_at = excluded.updated_at`,
      [userId, sport, kind, JSON.stringify(zonesArray), source],
      (err) => (err ? reject(err) : resolve())
    );
  });
}

function deleteZones(userId, sport) {
  return new Promise((resolve) => {
    db.run(
      `DELETE FROM athlete_zones WHERE user_id = ? AND sport = ? AND sport != 'default'`,
      [userId, sport],
      () => resolve()
    );
  });
}

/** Seed the default tables after onboarding, so scoring works from day one. */
async function seedDefaultZones(userId) {
  const { hrZones, powerZones } = await resolveZonesForUser(userId, "default");
  if (hrZones) await saveZones(userId, "default", "hr", hrZones, "derived").catch(() => {});
  if (powerZones) await saveZones(userId, "default", "power", powerZones, "derived").catch(() => {});
  return { hrZones, powerZones };
}

module.exports = {
  normaliseMetricKey,
  getAthleteMetrics,
  resolveZonesForUser,
  saveZones,
  deleteZones,
  seedDefaultZones,
};
