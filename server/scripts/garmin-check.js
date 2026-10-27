#!/usr/bin/env node
/**
 * Read-only look at one athlete's Garmin calendar: what rooka's sends left there.
 *
 * For every calendar entry from yesterday up to --days ahead it prints the workout Garmin
 * stored (name, which app made it, sport, how many steps Garmin kept), whether rooka
 * tracks it, and flags duplicates (two rooka entries of the same sport on one day).
 * Changes nothing, but every lookup counts towards Garmin's 200 calls a day per athlete
 * (one for the calendar plus one per entry).
 *
 * Usage (on the server):
 *   node scripts/garmin-check.js --user=<id | email | username> [--days=14]
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const db = require("../services/db");
const garmin = require("../services/garmin");

const API_BASE = process.env.GARMIN_API_BASE || "https://apis.garmin.com";
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.join("=") || true];
  }),
);
const get = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r))));
const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r || []))));
const ymd = (offset) => {
  const d = new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" })}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const countSteps = (w) => {
  const walk = (steps) => (Array.isArray(steps) ? steps.reduce((n, s) => n + 1 + walk(s && s.steps), 0) : 0);
  return ((w && w.segments) || []).reduce((n, seg) => n + walk(seg && seg.steps), 0);
};

async function garminGet(token, pathname) {
  const res = await fetch(`${API_BASE}${pathname}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  const text = await res.text().catch(() => "");
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {}
  return { status: res.status, ok: res.ok, json, text };
}

(async () => {
  await new Promise((r) => setTimeout(r, 1000)); // db.js migrations
  if (!args.user) throw new Error("Pass --user=<id | email | username>");
  const user = await get(`SELECT id, username, email FROM users WHERE id = ? OR email = ? OR username = ?`, [Number(args.user) || -1, args.user, args.user]);
  if (!user) throw new Error(`No user ${args.user}`);
  const days = Number(args.days) || 14;
  console.log(`\nGarmin calendar for ${user.username} (#${user.id}), ${ymd(-1)} .. ${ymd(days)}`);

  const tracked = await all(`SELECT workout_key, workout_id, schedule_id, calendar_date, source_hash, updated_at FROM garmin_workouts WHERE user_id = ? ORDER BY calendar_date`, [user.id]);
  console.log(`\nrooka tracks ${tracked.length} workout(s):`);
  for (const t of tracked) {
    console.log(`  ${t.calendar_date}  ${t.workout_key.padEnd(30)} workout ${t.workout_id}  schedule ${t.schedule_id || "MISSING"}  ${t.source_hash ? "synced" : "NOT SYNCED"}  (${t.updated_at})`);
  }

  const token = await garmin.getValidAccessToken(user.id);
  if (!token) throw new Error("No Garmin connection for this athlete");
  const cal = await garminGet(token, `/training-api/schedule?startDate=${ymd(-1)}&endDate=${ymd(days)}`);
  if (!cal.ok) throw new Error(`Calendar lookup refused: HTTP ${cal.status} ${cal.text.slice(0, 300)}`);
  const list = Array.isArray(cal.json) ? cal.json : (cal.json && (cal.json.schedules || cal.json.workoutSchedules || cal.json.items)) || [];
  console.log(`\nGarmin's answer to the calendar lookup (first 400 chars): ${cal.text.slice(0, 400)}`);
  console.log(`\nGarmin has ${list.length} calendar entr${list.length === 1 ? "y" : "ies"}:`);

  const seen = new Map(); // date|sport -> count of rooka entries
  for (const e of list) {
    const scheduleId = String(e.scheduleId ?? e.workoutScheduleId ?? e.id ?? "?");
    const workoutId = String(e.workoutId ?? (e.workout && e.workout.workoutId) ?? "?");
    const date = String(e.date || e.calendarDate || "?").slice(0, 10);
    const w = await garminGet(token, `/training-api/workout/v2/${encodeURIComponent(workoutId)}`);
    const isTracked = tracked.some((t) => String(t.workout_id) === workoutId);
    if (!w.ok) {
      console.log(`  ${date}  schedule ${scheduleId}  workout ${workoutId}  (workout lookup HTTP ${w.status}: not rooka's, or gone)`);
      continue;
    }
    const ours = w.json.workoutProvider === "rooka";
    const key = `${date}|${w.json.sport}`;
    if (ours) seen.set(key, (seen.get(key) || 0) + 1);
    console.log(
      `  ${date}  schedule ${scheduleId}  workout ${workoutId}  ${String(w.json.workoutName || "").padEnd(34)} ${String(w.json.workoutProvider || "-").padEnd(12)} ${String(w.json.sport).padEnd(18)} ${countSteps(w.json)} steps  ${isTracked ? "tracked" : ours ? "UNTRACKED rooka copy" : "other app"}`,
    );
  }
  const dupes = [...seen].filter(([, n]) => n > 1);
  console.log(dupes.length ? `\nDuplicates: ${dupes.map(([k, n]) => `${k.replace("|", " ")} x${n}`).join(", ")}` : "\nNo duplicate rooka entries.");
  process.exit(0);
})().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
