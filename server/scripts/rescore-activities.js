#!/usr/bin/env node
/**
 * Rescore every stored activity against the athlete's own zone tables.
 *
 * The old formula was `minutes x (1 + an absolute-bpm HR bonus)` and ignored
 * power completely, so it is not comparable with planned targets. This walks
 * the whole table and rewrites `rooka_score` using the shared zone model, then
 * refreshes each athlete's total.
 *
 *   node scripts/rescore-activities.js --dry-run     # report only
 *   node scripts/rescore-activities.js               # write
 *   node scripts/rescore-activities.js --since 2026-08-01
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const db = require("../services/db");
const zoneModel = require("../services/zones");
const athleteZones = require("../services/athleteZones");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const sinceIdx = args.indexOf("--since");
const SINCE = sinceIdx !== -1 ? args[sinceIdx + 1] : null;

function all(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])))
  );
}
function run(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.run(sql, params, (err) => (err ? reject(err) : resolve()))
  );
}

(async () => {
  const where = SINCE ? `WHERE substr(start_date, 1, 10) >= ?` : "";
  const params = SINCE ? [SINCE] : [];

  const rows = await all(
    `SELECT a.id, a.user_id, a.sport_type, a.moving_time_min, a.average_heartrate,
            a.average_watts, a.rooka_score, a.start_date, u.rooka_start_date
       FROM activities a
       LEFT JOIN users u ON u.id = a.user_id
       ${where.replace(/start_date/g, "a.start_date")} ORDER BY a.user_id, a.start_date`,
    params
  );

  if (rows.length === 0) {
    console.log("No activities matched.");
    process.exit(0);
  }

  // Resolve each athlete's tables once rather than per activity.
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const zonesByUser = {};
  for (const uid of userIds) {
    zonesByUser[uid] = await athleteZones.resolveZonesForUser(uid, "default");
  }

  let changed = 0;
  let unchanged = 0;
  let deltaTotal = 0;
  const perUser = {};

  let skippedPreStart = 0;

  for (const a of rows) {
    const { hrZones, powerZones } = zonesByUser[a.user_id] || {};

    // Training from before the athlete joined Rooka scores zero, exactly as the
    // sync does. Without this the backfill would credit years of history and
    // inflate every total, level and leaderboard position.
    const startDay = a.rooka_start_date ? a.rooka_start_date.substring(0, 10) : null;
    const actDay = a.start_date ? a.start_date.substring(0, 10) : null;
    const countsTowardsRooka = !startDay || (actDay && actDay >= startDay);

    const next = countsTowardsRooka
      ? zoneModel.scoreActivity({
          movingMinutes: a.moving_time_min,
          avgHr: a.average_heartrate,
          avgWatts: a.average_watts,
          hrZones,
          powerZones,
        })
      : 0;

    if (!countsTowardsRooka) skippedPreStart++;
    const prev = Number(a.rooka_score) || 0;
    const delta = Math.round((next - prev) * 10) / 10;

    perUser[a.user_id] = perUser[a.user_id] || { before: 0, after: 0, n: 0 };
    perUser[a.user_id].before += prev;
    perUser[a.user_id].after += next;
    perUser[a.user_id].n++;

    if (Math.abs(delta) < 0.05) {
      unchanged++;
      continue;
    }
    changed++;
    deltaTotal += delta;
    if (!DRY_RUN) {
      await run(`UPDATE activities SET rooka_score = ? WHERE id = ?`, [next, a.id]);
    }
  }

  console.log(`\n${DRY_RUN ? "[DRY RUN] " : ""}Rescored ${rows.length} activities`);
  console.log(`  changed:   ${changed}`);
  console.log(`  unchanged: ${unchanged}`);
  console.log(`  before the athlete joined (kept at 0): ${skippedPreStart}`);
  console.log(`  net Rooka change: ${deltaTotal > 0 ? "+" : ""}${Math.round(deltaTotal)}\n`);

  console.log("  user   activities        before         after       change");
  for (const [uid, t] of Object.entries(perUser)) {
    const before = Math.round(t.before);
    const after = Math.round(t.after);
    const diff = after - before;
    console.log(
      `  ${String(uid).padStart(4)}   ${String(t.n).padStart(10)}   ${String(before).padStart(11)}   ${String(after).padStart(11)}   ${(diff > 0 ? "+" : "") + diff}`
    );
  }

  if (DRY_RUN) {
    console.log("\nNothing written. Re-run without --dry-run to apply.");
    process.exit(0);
  }

  // Totals are derived from the activity rows, so refresh them after rewriting.
  const { updateUserRookaAndCheckLevel } = require("../services/utils");
  for (const uid of userIds) updateUserRookaAndCheckLevel(uid);
  console.log("\nTotals refreshed. Give it a few seconds, then check /api/user/settings.");
  setTimeout(() => process.exit(0), 4000);
})().catch((e) => {
  console.error("Rescore failed:", e);
  process.exit(1);
});
