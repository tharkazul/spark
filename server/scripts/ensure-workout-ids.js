#!/usr/bin/env node
/**
 * Ensures the `micro_plan` table has an `id INTEGER PRIMARY KEY AUTOINCREMENT`
 * column and that every planned workout (for Quinten or all athletes) has a
 * unique, non-null integer `id`.
 *
 * Dry run by default: prints the current status and any missing/duplicate IDs.
 * Pass `--apply` to rebuild/backfill in place.
 *
 *   node scripts/ensure-workout-ids.js                 (all athletes, dry run)
 *   node scripts/ensure-workout-ids.js --user Quinten  (inspect one athlete)
 *   node scripts/ensure-workout-ids.js --apply         (fix in place)
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const db = require("../services/db");

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const userArg = (() => {
  const i = argv.indexOf("--user");
  return i === -1 ? null : argv[i + 1];
})();

const all = (sql, p = []) =>
  new Promise((resolve, reject) => db.all(sql, p, (e, rows) => (e ? reject(e) : resolve(rows || []))));
const run = (sql, p = []) =>
  new Promise((resolve, reject) => db.run(sql, p, function (e) { e ? reject(e) : resolve(this); }));

async function main() {
  // Wait briefly for db.js startup migrations to settle
  await new Promise((r) => setTimeout(r, 1500));

  const cols = await all(`PRAGMA table_info(micro_plan);`);
  const idCol = cols.find((c) => c.name === "id");
  const hasPkId = Boolean(idCol && idCol.pk);

  console.log(
    `micro_plan schema: id column=${idCol ? "present" : "MISSING"}, primary_key=${hasPkId ? "YES" : "NO"}`
  );

  if (!hasPkId && APPLY) {
    console.log("Rebuilding micro_plan with id INTEGER PRIMARY KEY AUTOINCREMENT...");
    const colNames = new Set(cols.map((c) => c.name));
    const rookaExpr = colNames.has("target_rooka")
      ? "target_rooka"
      : colNames.has("target_spark")
      ? "target_spark"
      : colNames.has("target_tss")
      ? "target_tss"
      : "0";
    const stepsExpr = colNames.has("steps_json") ? "steps_json" : "'[]'";
    const sourceExpr = colNames.has("source") ? "COALESCE(source, 'coach')" : "'coach'";
    const originExpr = colNames.has("origin") ? "origin" : "NULL";

    await run(`DROP TABLE IF EXISTS micro_plan_new`);
    await run(
      `CREATE TABLE micro_plan_new (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, date TEXT, sport TEXT, description TEXT, target_rooka REAL, details TEXT, steps_json TEXT, source TEXT DEFAULT 'coach', origin TEXT, FOREIGN KEY(user_id) REFERENCES users(id))`
    );
    await run(
      `INSERT INTO micro_plan_new (user_id, date, sport, description, target_rooka, details, steps_json, source, origin)
       SELECT user_id, date, sport, description, ${rookaExpr}, details, ${stepsExpr}, ${sourceExpr}, ${originExpr} FROM micro_plan`
    );
    await run(`DROP TABLE micro_plan`);
    await run(`ALTER TABLE micro_plan_new RENAME TO micro_plan`);
    console.log("Rebuilt micro_plan successfully.");
  }

  // Also backfill any NULL ids using SQLite rowid
  if (APPLY) {
    const res = await run(`UPDATE micro_plan SET id = rowid WHERE id IS NULL`);
    if (res && res.changes > 0) {
      console.log(`Backfilled ${res.changes} workout(s) with NULL id using rowid.`);
    }
  }

  const users = userArg
    ? await all(
        `SELECT id, username, email FROM users WHERE deleted_at IS NULL AND (id = ? OR LOWER(username) LIKE '%' || LOWER(?) || '%' OR LOWER(email) LIKE '%' || LOWER(?) || '%')`,
        [userArg, userArg, userArg]
      )
    : await all(`SELECT id, username, email FROM users WHERE deleted_at IS NULL ORDER BY id`);

  if (userArg && users.length === 0) {
    console.log(`No user found matching "${userArg}".`);
    process.exit(0);
  }

  let totalChecked = 0;
  let totalBad = 0;

  for (const u of users) {
    const rows = await all(
      `SELECT rowid AS _rowid, id, date, sport, description FROM micro_plan WHERE user_id = ? ORDER BY date ASC`,
      [u.id]
    );
    if (rows.length === 0 && !userArg) continue;

    const seenIds = new Set();
    const badRows = [];
    for (const r of rows) {
      totalChecked++;
      if (r.id === null || r.id === undefined || seenIds.has(String(r.id))) {
        badRows.push(r);
        totalBad++;
      } else {
        seenIds.add(String(r.id));
      }
    }

    if (userArg || badRows.length > 0) {
      console.log(
        `\nAthlete #${u.id} (${u.username || u.email}): ${rows.length} workout(s), ${badRows.length} missing/duplicate ID(s)`
      );
      for (const r of rows.slice(-14)) {
        console.log(`  [id=${r.id} / rowid=${r._rowid}] ${r.date} | ${r.sport} | ${r.description}`);
      }
    }
  }

  console.log(
    `\nSummary: checked ${totalChecked} workout(s) across ${users.length} athlete(s); ${totalBad} missing/duplicate ID(s) found.${
      !APPLY && (totalBad > 0 || !hasPkId) ? " Run with --apply to repair." : " All workout IDs are unique!"
    }`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
