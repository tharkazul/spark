#!/usr/bin/env node
/**
 * One-off clean-up for workouts imported twice before services/activityMerge.js
 * existed (an Apple Watch run from both Apple Health and Strava, a Suunto run
 * that also came in through Strava), plus scores stored as "NaN".
 *
 * Dry run by default: prints what it would merge. Nothing changes without --apply.
 * The duplicate is hidden, not deleted; its kudos and comments move to the row
 * that stays, which keeps every source id and the best data from both.
 *
 *   node scripts/merge-duplicate-activities.js                 (all athletes, dry run)
 *   node scripts/merge-duplicate-activities.js --user Quinten  (one athlete)
 *   node scripts/merge-duplicate-activities.js --apply
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const db = require("../services/db");
const merge = require("../services/activityMerge");

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const userArg = (() => {
  const i = argv.indexOf("--user");
  return i === -1 ? null : argv[i + 1];
})();

const all = (sql, p = []) => new Promise((r, j) => db.all(sql, p, (e, rows) => (e ? j(e) : r(rows || []))));
const get = (sql, p = []) => new Promise((r, j) => db.get(sql, p, (e, row) => (e ? j(e) : r(row || null))));
const run = (sql, p = []) => new Promise((r, j) => db.run(sql, p, (e) => (e ? j(e) : r())));

const sourceOf = (a) => (a.strava_activity_id ? "strava" : a.suunto_workout_id ? "suunto" : a.healthkit_workout_id ? "healthkit" : "manual");

async function main() {
  await new Promise((r) => setTimeout(r, 2000)); // let db.js finish its migrations
  const fixed = APPLY ? await merge.repairFakeStravaIds() : (await all(
    `SELECT COUNT(*) AS n FROM activities WHERE strava_activity_id = CAST(id AS TEXT) AND (healthkit_workout_id IS NOT NULL OR suunto_workout_id IS NOT NULL)`
  ))[0].n;
  console.log(`${fixed} Apple Health/Suunto workout(s) with a fake Strava id${APPLY ? " cleared" : " (cleared with --apply)"}.\n`);
  const users = userArg
    ? await all(`SELECT id, username FROM users WHERE deleted_at IS NULL AND (id = ? OR LOWER(username) = LOWER(?))`, [userArg, userArg])
    : await all(`SELECT id, username FROM users WHERE deleted_at IS NULL ORDER BY id`);
  if (!users.length) throw new Error(`No athlete matching "${userArg}"`);

  let pairs = 0;
  let nanFixed = 0;
  for (const u of users) {
    const acts = await all(
      `SELECT * FROM activities WHERE user_id = ? AND (is_hidden IS NULL OR is_hidden = 0) ORDER BY start_date`,
      [u.id]
    );
    // In a dry run the fake Strava ids are still there; judge as if they were cleared.
    for (const a of acts) {
      if (a.strava_activity_id === String(a.id) && (a.healthkit_workout_id || a.suunto_workout_id)) a.strava_activity_id = null;
    }
    const gone = new Set();
    for (let i = 0; i < acts.length; i++) {
      if (gone.has(acts[i].id)) continue;
      for (let j = i + 1; j < acts.length; j++) {
        const a = acts[i];
        const b = acts[j];
        if (gone.has(b.id) || gone.has(a.id)) continue;
        const dt = Math.abs(new Date(String(b.start_date).replace(" ", "T")) - new Date(String(a.start_date).replace(" ", "T")));
        if (dt > 15 * 60000) break; // sorted by start: nothing further can match a
        if (sourceOf(a) === sourceOf(b) && sourceOf(a) !== "manual") continue; // two uploads from one source are two workouts
        if (!merge.isSameWorkout(a, { ...b, source: sourceOf(b) })) continue;
        // Keep the richer source (Strava > Suunto > Apple Health > typed in).
        const [keep, dup] = (merge.SOURCE_RANK[sourceOf(a)] || 0) >= (merge.SOURCE_RANK[sourceOf(b)] || 0) ? [a, b] : [b, a];
        pairs++;
        console.log(
          `${u.username}: keep #${keep.id} ${sourceOf(keep)} "${keep.name}" (${keep.sport_type}, ${Math.round(keep.moving_time_min)} min, ${String(keep.start_date).slice(0, 16)})` +
            `  <-  #${dup.id} ${sourceOf(dup)} "${dup.name}" (${dup.sport_type}, ${Math.round(dup.moving_time_min)} min, ${String(dup.start_date).slice(0, 16)})`
        );
        if (APPLY) {
          await merge.foldExisting(keep, dup);
          Object.assign(keep, await get(`SELECT * FROM activities WHERE id = ?`, [keep.id]));
        }
        gone.add(dup.id);
      }
    }

    // Scores stored as text ("NaN", "[object Promise]") by the old Apple Health import.
    const broken = await all(`SELECT id, name FROM activities WHERE user_id = ? AND typeof(rooka_score) = 'text'`, [u.id]);
    for (const b of broken) {
      nanFixed++;
      console.log(`${u.username}: score of #${b.id} "${b.name}" is not a number -> recalculated`);
      if (APPLY) {
        const a = await get(`SELECT * FROM activities WHERE id = ?`, [b.id]);
        const { calculateRookaScoreZoned, mapStravaSportToRooka } = require("../services/utils");
        const score = await calculateRookaScoreZoned({
          userId: u.id,
          movingTimeMin: a.moving_time_min,
          avgHr: Number(a.average_heartrate) || null,
          sport: mapStravaSportToRooka(a.sport_type),
        });
        await run(`UPDATE activities SET rooka_score = ?, tss = ? WHERE id = ?`, [score, score, b.id]);
      }
    }
    if (APPLY && (gone.size || broken.length)) {
      await require("../services/utils").updateUserRookaAndCheckLevel(u.id, { isRealtime: false });
    }
  }

  console.log(`\n${pairs} duplicate pair(s), ${nanFixed} broken score(s). ${APPLY ? "Applied." : "Dry run: nothing changed. Add --apply to merge."}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
