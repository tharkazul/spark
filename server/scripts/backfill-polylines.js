#!/usr/bin/env node
/**
 * Fetch the route of every stored Strava activity that has none.
 *
 * `activities.polyline` was added after the fact, so history synced before it
 * existed has the column but no value and the map falls back to nothing. This
 * walks the gaps per athlete, pulls `map.summary_polyline` off the Strava
 * summary feed, and fills them in.
 *
 * Strava's read quota is 100 requests per 15 minutes / 1000 per day per app, so
 * this reads the paginated activity *list* (200 activities per request) rather
 * than one detail request per activity.
 *
 *   node scripts/backfill-polylines.js --dry-run     # report only
 *   node scripts/backfill-polylines.js               # write
 *   node scripts/backfill-polylines.js --user 3      # one athlete
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const db = require("../services/db");
const { extractStravaPolyline } = require("../services/utils");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const userIdx = args.indexOf("--user");
const ONLY_USER = userIdx !== -1 ? Number(args[userIdx + 1]) : null;

const PER_PAGE = 200;
const MAX_PAGES = 10; // 2000 activities per athlete is well past any real history

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

async function accessTokenFor(refreshToken) {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(data.message || "Strava rejected the refresh token");
  }
  return data.access_token;
}

(async () => {
  const userFilter = ONLY_USER ? `AND a.user_id = ?` : "";
  const params = ONLY_USER ? [ONLY_USER] : [];

  // Only activities that came from Strava can have a route recovered this way.
  // The refresh token lives in two places and the two can drift, so carry both
  // and try each in turn.
  const gaps = await all(
    `SELECT a.user_id, a.strava_activity_id,
            u.strava_refresh_token, t.refresh_token AS token_table_refresh
       FROM activities a
       JOIN users u ON u.id = a.user_id AND u.deleted_at IS NULL
       LEFT JOIN strava_tokens t ON t.user_id = u.id
      WHERE a.strava_activity_id IS NOT NULL
        AND (a.polyline IS NULL OR a.polyline = '')
        AND COALESCE(u.strava_refresh_token, t.refresh_token) IS NOT NULL
        ${userFilter}
      ORDER BY a.user_id`,
    params
  );

  if (gaps.length === 0) {
    console.log("Every Strava activity already has a route stored.");
    process.exit(0);
  }

  const byUser = new Map();
  for (const g of gaps) {
    if (!byUser.has(g.user_id)) {
      const tokens = [g.strava_refresh_token, g.token_table_refresh].filter(
        (t, i, arr) => t && arr.indexOf(t) === i
      );
      byUser.set(g.user_id, { tokens, ids: new Set() });
    }
    byUser.get(g.user_id).ids.add(String(g.strava_activity_id));
  }

  console.log(
    `${DRY_RUN ? "[DRY RUN] " : ""}${gaps.length} activities without a route, across ${byUser.size} athlete(s).\n`
  );

  let filled = 0;
  let noRoute = 0;
  let notReturned = 0;

  for (const [userId, { tokens, ids }] of byUser) {
    let accessToken = null;
    let lastError = "no refresh token stored";
    for (const token of tokens) {
      try {
        accessToken = await accessTokenFor(token);
        break;
      } catch (e) {
        lastError = e.message;
      }
    }
    if (!accessToken) {
      console.error(
        `  user ${userId}: skipped — ${lastError}. Reconnect Strava in the app, then re-run.`
      );
      continue;
    }

    const seen = new Set();
    let userFilled = 0;
    let userNoRoute = 0;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await fetch(
        `https://www.strava.com/api/v3/athlete/activities?per_page=${PER_PAGE}&page=${page}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) {
        console.error(`  user ${userId}: Strava returned ${res.status} on page ${page}`);
        break;
      }
      const batch = await res.json();
      if (!Array.isArray(batch) || batch.length === 0) break;

      for (const act of batch) {
        const id = String(act.id);
        if (!ids.has(id)) continue;
        seen.add(id);

        const line = extractStravaPolyline(act);
        if (!line) {
          // An indoor or manually entered activity has no GPS trace at all.
          userNoRoute++;
          continue;
        }
        if (!DRY_RUN) {
          await run(
            `UPDATE activities SET polyline = ? WHERE user_id = ? AND strava_activity_id = ?`,
            [line, userId, id]
          );
        }
        userFilled++;
      }

      if (batch.length < PER_PAGE) break;
    }

    const missing = ids.size - seen.size;
    filled += userFilled;
    noRoute += userNoRoute;
    notReturned += missing;

    console.log(
      `  user ${String(userId).padStart(4)}: ${String(userFilled).padStart(4)} routes recovered, ` +
        `${String(userNoRoute).padStart(4)} have no GPS, ${String(missing).padStart(4)} not returned by Strava`
    );
  }

  console.log(`\nroutes recovered:            ${filled}`);
  console.log(`no GPS trace (indoor/manual): ${noRoute}`);
  console.log(`not in Strava's feed:         ${notReturned}`);

  if (DRY_RUN) {
    console.log("\nNothing written. Re-run without --dry-run to apply.");
  }
  process.exit(0);
})().catch((e) => {
  console.error("Polyline backfill failed:", e);
  process.exit(1);
});
