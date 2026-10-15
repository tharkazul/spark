#!/usr/bin/env node
/**
 * Copy an athlete's most recent activities to another account, e.g. to give
 * the App Store reviewer account a realistic workout history.
 *
 *   node scripts/copy-activities.js --from 11 --to-username AppleTestAccount            # report only
 *   node scripts/copy-activities.js --from 11 --to-username AppleTestAccount --apply    # write
 *   node scripts/copy-activities.js --from 11 --to 42 --limit 30 --apply
 *
 * The copies are standalone rows: no Strava/Suunto/HealthKit ids (so syncs and
 * Strava write-backs never touch the original), no link to another activity,
 * no kudos, and already marked as coach-analysed so no AI message fires. GPS
 * routes are left out, because a route starts and ends at the owner's door.
 *
 * Activities dated before an athlete's rooka_start_date are reset to 0 points
 * on every server start, so the target's start date is moved back to the
 * oldest copied activity and its total_rooka recalculated.
 *
 * Running it twice doesn't duplicate: an activity the target already has (same
 * start date, sport and name) is skipped. A database snapshot is taken first.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const db = require("../services/db");
const { createSnapshot } = require("../services/backup");

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
};
const APPLY = args.includes("--apply");
const FROM = parseInt(arg("--from"), 10);
const TO_ID = arg("--to") ? parseInt(arg("--to"), 10) : null;
const TO_USERNAME = arg("--to-username");
const LIMIT = parseInt(arg("--limit") || "20", 10);

// Columns that must not be copied: identity, external sync ids, links to other
// rows, and the GPS route.
const SKIP_COLUMNS = new Set([
  "id",
  "user_id",
  "strava_activity_id",
  "suunto_workout_id",
  "healthkit_workout_id",
  "linked_activity_id",
  "linked_activity_name",
  "polyline",
  "coach_analyzed",
]);

const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const get = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r))));
const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));

async function main() {
  if (!FROM || (!TO_ID && !TO_USERNAME) || !(LIMIT > 0)) {
    console.error("Usage: node scripts/copy-activities.js --from <userId> (--to <userId> | --to-username <name>) [--limit 20] [--apply]");
    process.exit(1);
  }

  const source = await get(`SELECT id, username FROM users WHERE id = ? AND deleted_at IS NULL`, [FROM]);
  if (!source) throw new Error(`Source user ${FROM} not found.`);

  // Usernames are matched trimmed and case-insensitively (a copied name can
  // carry a stray tab or space), but it must match exactly one account.
  const targets = TO_ID
    ? await all(`SELECT id, username, rooka_start_date FROM users WHERE id = ? AND deleted_at IS NULL`, [TO_ID])
    : await all(
        `SELECT id, username, rooka_start_date FROM users WHERE LOWER(TRIM(username, ' ' || char(9))) = LOWER(TRIM(?, ' ' || char(9))) AND deleted_at IS NULL`,
        [TO_USERNAME],
      );
  if (targets.length !== 1) throw new Error(`Expected exactly one target account, found ${targets.length}.`);
  const target = targets[0];
  if (target.id === source.id) throw new Error("Source and target are the same account.");

  const columns = (await all(`PRAGMA table_info(activities)`)).map((c) => c.name).filter((c) => !SKIP_COLUMNS.has(c));

  const activities = await all(
    `SELECT ${columns.join(", ")} FROM activities
      WHERE user_id = ? AND (is_hidden IS NULL OR is_hidden = 0)
      ORDER BY start_date DESC LIMIT ?`,
    [source.id, LIMIT],
  );

  const toCopy = [];
  for (const a of activities) {
    const exists = await get(
      `SELECT 1 AS ok FROM activities WHERE user_id = ? AND start_date = ? AND sport_type IS ? AND name IS ?`,
      [target.id, a.start_date, a.sport_type, a.name],
    );
    if (!exists) toCopy.push(a);
  }

  console.log(`From: #${source.id} ${JSON.stringify(source.username)}`);
  console.log(`To:   #${target.id} ${JSON.stringify(target.username)}`);
  console.log(`Last ${activities.length} visible activities; ${toCopy.length} to copy, ${activities.length - toCopy.length} already present.\n`);
  for (const a of toCopy) {
    console.log(`  ${String(a.start_date).slice(0, 16)}  ${String(a.sport_type).padEnd(10)}  ${String(a.name || "").slice(0, 45).padEnd(45)}  ${Math.round(a.rooka_score || 0)} pts`);
  }

  if (!APPLY) {
    console.log("\nReport only. Re-run with --apply to write.");
    return;
  }
  if (toCopy.length === 0) {
    console.log("\nNothing to copy.");
    return;
  }

  const snapshot = await createSnapshot("before_copy_activities");
  console.log(`\nSnapshot: ${snapshot.filepath}`);

  const insertColumns = ["user_id", "coach_analyzed", ...columns];
  const placeholders = insertColumns.map(() => "?").join(", ");
  await run("BEGIN");
  try {
    for (const a of toCopy) {
      await run(
        `INSERT INTO activities (${insertColumns.join(", ")}) VALUES (${placeholders})`,
        [target.id, 1, ...columns.map((c) => a[c])],
      );
    }

    // Keep the copied history scoring: move the start date back if needed.
    const oldest = toCopy.reduce((min, a) => (String(a.start_date) < min ? String(a.start_date) : min), String(toCopy[0].start_date));
    if (!target.rooka_start_date || oldest.slice(0, 10) < String(target.rooka_start_date).slice(0, 10)) {
      await run(`UPDATE users SET rooka_start_date = ? WHERE id = ?`, [oldest.slice(0, 10), target.id]);
    }
    await run(
      `UPDATE users SET total_rooka = (
         SELECT COALESCE(SUM(a.rooka_score), 0) FROM activities a
          WHERE a.user_id = users.id AND substr(a.start_date, 1, 10) >= substr(users.rooka_start_date, 1, 10)
       ) WHERE id = ?`,
      [target.id],
    );
    // Cached public profile would otherwise show the old totals.
    await run(`DELETE FROM public_profile_cache WHERE user_id = ?`, [target.id]).catch(() => {});
    await run("COMMIT");
  } catch (err) {
    await run("ROLLBACK");
    throw err;
  }

  const after = await get(`SELECT rooka_start_date, total_rooka FROM users WHERE id = ?`, [target.id]);
  console.log(`Copied ${toCopy.length} activities. Target rooka_start_date=${after.rooka_start_date}, total_rooka=${Math.round(after.total_rooka)}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed:", err.message);
    process.exit(1);
  });
