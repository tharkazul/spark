#!/usr/bin/env node
/**
 * Read-only: an athlete's planned workouts with where each came from and how many
 * steps it has. For questions like "why does this strength session have no exercises?".
 *
 *   node scripts/show-plan.js --user Tharaka                (this week and next)
 *   node scripts/show-plan.js --user Tharaka --from 2026-10-26 --to 2026-11-01
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

// Opened read-only on purpose: requiring services/db would run its start-up migrations.
const sqlite3 = require("sqlite3");
const dbPath = process.env.DB_PATH
  ? path.resolve(__dirname, "..", process.env.DB_PATH)
  : path.join(__dirname, "..", "rooka_native.db");
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? null : argv[i + 1];
};
const userArg = arg("user");
if (!userArg) {
  console.error("Usage: node scripts/show-plan.js --user <username or id> [--from YYYY-MM-DD] [--to YYYY-MM-DD]");
  process.exit(1);
}
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const from = arg("from") || day(-7);
const to = arg("to") || day(14);

const all = (sql, p = []) => new Promise((r, j) => db.all(sql, p, (e, rows) => (e ? j(e) : r(rows || []))));

const countSteps = (json) => {
  try {
    const steps = JSON.parse(json || "[]");
    const walk = (list) => (Array.isArray(list) ? list.reduce((n, s) => n + (Array.isArray(s.steps) ? walk(s.steps) : 1), 0) : 0);
    return walk(steps);
  } catch {
    return "unreadable";
  }
};

async function main() {
  const users = await all(
    `SELECT id, username FROM users WHERE deleted_at IS NULL AND (id = ? OR LOWER(username) LIKE LOWER(?))`,
    [userArg, `%${userArg}%`]
  );
  if (!users.length) throw new Error(`No athlete matching "${userArg}"`);
  for (const u of users) {
    console.log(`\n${u.username} (#${u.id}), ${from} to ${to}`);
    const rows = await all(
      `SELECT * FROM micro_plan WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date, id`,
      [u.id, from, to]
    );
    for (const r of rows) {
      console.log(
        `  ${r.date}  ${String(r.sport).padEnd(9)} steps=${String(countSteps(r.steps_json)).padEnd(3)} ` +
          `source=${r.source || "-"} origin=${r.origin || "-"}  "${r.description || ""}"`
      );
    }
    if (!rows.length) console.log("  (nothing planned)");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
