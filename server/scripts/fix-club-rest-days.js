#!/usr/bin/env node
/**
 * fix-club-rest-days.js
 *
 * One-off: plan entries from today on that are a rest day with a match ("Rustdag en padel",
 * sport Rest) become a session (sport Run), as new plans now store them (services/clubSport.js).
 * Their points stay as they are (0).
 *
 * Usage (from server/):
 *   node scripts/fix-club-rest-days.js           # dry run: lists what would change
 *   node scripts/fix-club-rest-days.js --apply   # changes them
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
const db = require("../services/db");
const { planEntrySport } = require("../services/clubSport");

const apply = process.argv.includes("--apply");
const all = (sql, p = []) => new Promise((resolve, reject) => db.all(sql, p, (e, r) => (e ? reject(e) : resolve(r || []))));
const run = (sql, p = []) => new Promise((resolve, reject) => db.run(sql, p, (e) => (e ? reject(e) : resolve())));

(async () => {
  await new Promise((r) => setTimeout(r, 300)); // let db.js finish opening
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
  const rows = await all(
    `SELECT id, user_id, date, sport, description FROM micro_plan WHERE LOWER(sport) = 'rest' AND date >= ? ORDER BY date`,
    [today],
  );
  const fix = rows.filter((r) => planEntrySport(r.sport, r.description) !== r.sport);
  if (!fix.length) {
    console.log("No rest days with a match from today on. Nothing to do.");
    process.exit(0);
  }
  for (const r of fix) console.log(`#${r.id} user ${r.user_id} ${r.date}: "${r.description}" Rest -> Run`);
  if (!apply) {
    console.log(`\nDry run: ${fix.length} entries. Add --apply to change them.`);
    process.exit(0);
  }
  for (const r of fix) await run(`UPDATE micro_plan SET sport = 'Run' WHERE id = ?`, [r.id]);
  console.log(`\n✅ ${fix.length} entries changed.`);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
