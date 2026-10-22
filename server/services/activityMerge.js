/**
 * One workout, however many sources report it.
 *
 * A run recorded on an Apple Watch reaches rooka twice: from Apple Health when
 * the app syncs, and from Strava (which the watch also uploads to). Suunto and
 * Strava overlap the same way. Every import calls absorbIfDuplicate() first: if
 * the athlete already has this workout from another source, the new data is
 * merged into that row (each source fills what the other lacks) and nothing new
 * is inserted.
 *
 * Same workout = same athlete, start times within 15 minutes, a compatible sport
 * (the same family, or one side generic like "Cardio"), durations within 1.5x,
 * and not already from the same source (two Strava uploads at once are two
 * activities).
 */
const db = require("./db");

const get = (sql, p = []) => new Promise((r) => db.get(sql, p, (e, row) => r(e ? null : row || null)));
const all = (sql, p = []) => new Promise((r) => db.all(sql, p, (e, rows) => r(e || !rows ? [] : rows)));
const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { return e ? rej(e) : res(this); }));

const MATCH_WINDOW_MIN = 15;
const MAX_DURATION_RATIO = 1.5;
const HEALTHKIT_TWIN_WINDOW_MIN = 2;
const SAME_START_WINDOW_MIN = 3;

const SOURCE_COLUMN = { strava: "strava_activity_id", healthkit: "healthkit_workout_id", suunto: "suunto_workout_id" };
// Whose title and distance/time win when two sources disagree: Strava carries the
// athlete's own title (and rooka's), Apple Health only generated names.
const SOURCE_RANK = { strava: 3, suunto: 2, healthkit: 1, manual: 0 };

const GENERIC_SPORTS = new Set(["cardio", "other", "workout", "crosstraining", "mixedcardio"]);

function sportFamily(sport) {
  const s = String(sport || "").toLowerCase().replace(/[\s_-]+/g, "");
  if (/run|treadmill/.test(s)) return "run";
  if (/ride|bike|cycl|spin/.test(s)) return "ride";
  if (/swim/.test(s)) return "swim";
  if (/walk|hike/.test(s)) return "walk";
  if (/strength|weight|gym/.test(s)) return "strength";
  if (/yoga|mobility|pilates|stretch/.test(s)) return "mobility";
  return s;
}

const isGeneric = (sport) => GENERIC_SPORTS.has(String(sport || "").toLowerCase().replace(/[\s_-]+/g, ""));

function sportsCompatible(a, b) {
  return isGeneric(a) || isGeneric(b) || sportFamily(a) === sportFamily(b);
}

function rankOfRow(row) {
  if (row.strava_activity_id) return SOURCE_RANK.strava;
  if (row.suunto_workout_id) return SOURCE_RANK.suunto;
  if (row.healthkit_workout_id) return SOURCE_RANK.healthkit;
  return SOURCE_RANK.manual;
}

/** True when `row` and `incoming` are the same workout (see the header for the rule). */
function isSameWorkout(row, incoming) {
  const col = SOURCE_COLUMN[incoming.source];
  const t1 = new Date(String(row.start_date).replace(" ", "T")).getTime();
  const t2 = new Date(String(incoming.start_date).replace(" ", "T")).getTime();
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return false;
  if (col && row[col]) {
    // Already has this source, so normally a different workout from it (two Strava
    // uploads at once are two activities). Apple Health is the exception: Garmin
    // Connect can write the same workout into it twice, under two ids.
    return (
      incoming.source === "healthkit" &&
      Math.abs(t1 - t2) <= HEALTHKIT_TWIN_WINDOW_MIN * 60000 &&
      sportFamily(row.sport_type) === sportFamily(incoming.sport_type)
    );
  }
  if (Math.abs(t1 - t2) > MATCH_WINDOW_MIN * 60000) return false;
  if (!sportsCompatible(row.sport_type, incoming.sport_type)) return false;
  // Started within a few minutes: the same workout, however the durations differ.
  // Sources count time differently (Strava's moving time leaves out the rests of a
  // pool swim: 17 min against Garmin's 30), and no one starts a second one that fast.
  if (Math.abs(t1 - t2) <= SAME_START_WINDOW_MIN * 60000) return true;
  const d1 = Number(row.moving_time_min) || 0;
  const d2 = Number(incoming.moving_time_min) || 0;
  if (d1 > 0 && d2 > 0 && Math.max(d1, d2) / Math.min(d1, d2) > MAX_DURATION_RATIO) return false;
  return true;
}

/** The athlete's existing row for this workout from another source, or null. */
async function findDuplicate(userId, incoming) {
  const start = String(incoming.start_date || "");
  if (!start) return null;
  const rows = await all(
    `SELECT * FROM activities
      WHERE user_id = ? AND (is_hidden IS NULL OR is_hidden = 0)
        AND ABS(julianday(replace(start_date, ' ', 'T')) - julianday(?)) * 1440 <= ?`,
    [userId, start.replace(" ", "T"), MATCH_WINDOW_MIN]
  );
  const t = new Date(start.replace(" ", "T")).getTime();
  return (
    rows
      .filter((r) => isSameWorkout(r, incoming))
      .sort((a, b) => Math.abs(new Date(String(a.start_date).replace(" ", "T")) - t) - Math.abs(new Date(String(b.start_date).replace(" ", "T")) - t))[0] || null
  );
}

const present = (v) => v !== null && v !== undefined && v !== "" && !(typeof v === "number" && v === 0);

/** The merged column values for `row` once `incoming` is folded in. */
function mergedFields(row, incoming) {
  const incomingWins = (SOURCE_RANK[incoming.source] || 0) > rankOfRow(row);
  // Measured values (heart rate, power, laps, route): whoever has them.
  const keepOrFill = (col) => (present(row[col]) ? row[col] : present(incoming[col]) ? incoming[col] : row[col]);
  // Title, distance and time: the higher-ranked source, when it has a value.
  const preferRanked = (col) =>
    incomingWins && present(incoming[col]) ? incoming[col] : present(row[col]) ? row[col] : incoming[col] ?? row[col];

  const gainedHr = !present(row.average_heartrate) && present(incoming.average_heartrate);
  const out = {
    name: preferRanked("name"),
    sport_type: isGeneric(row.sport_type) && !isGeneric(incoming.sport_type) ? incoming.sport_type : row.sport_type,
    distance_km: preferRanked("distance_km"),
    elevation_m: preferRanked("elevation_m"),
    moving_time_min: preferRanked("moving_time_min"),
    average_heartrate: keepOrFill("average_heartrate"),
    average_watts: keepOrFill("average_watts"),
    max_heartrate: keepOrFill("max_heartrate"),
    laps_json: keepOrFill("laps_json"),
    sets_json: keepOrFill("sets_json"),
    polyline: keepOrFill("polyline"),
    // The score follows the better data: the higher-ranked source, or whichever brought heart rate.
    rooka_score: (incomingWins || gainedHr) && incoming.rooka_score != null ? incoming.rooka_score : row.rooka_score,
    tss: (incomingWins || gainedHr) && incoming.tss != null ? incoming.tss : row.tss,
  };
  const col = SOURCE_COLUMN[incoming.source];
  // Keep the row's own id for a source it already has (an Apple Health twin), so the
  // next sync still finds it.
  if (col && incoming.sourceId && !row[col]) out[col] = String(incoming.sourceId);
  return out;
}

async function mergeInto(row, incoming) {
  const fields = mergedFields(row, incoming);
  // Only columns this table has (`row` is a SELECT *): older databases miss some.
  const cols = Object.keys(fields).filter((c) => c in row);
  await run(`UPDATE activities SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...cols.map((c) => fields[c]), row.id]);
  return fields;
}

/**
 * Call before inserting an imported workout. Returns the id of the row it was
 * merged into, or null when it is new (or already stored from this source, in
 * which case the caller's own upsert handles it).
 *
 * incoming: { source: 'strava'|'healthkit'|'suunto', sourceId, name, sport_type,
 *   start_date (UTC ISO), moving_time_min, distance_km, elevation_m,
 *   average_heartrate, average_watts, max_heartrate, laps_json, sets_json, polyline,
 *   rooka_score, tss }
 */
async function absorbIfDuplicate(userId, incoming) {
  try {
    const col = SOURCE_COLUMN[incoming.source];
    if (col && incoming.sourceId) {
      const own = await get(`SELECT id FROM activities WHERE user_id = ? AND ${col} = ?`, [userId, String(incoming.sourceId)]);
      if (own) return null;
    }
    const match = await findDuplicate(userId, incoming);
    if (!match) return null;
    await mergeInto(match, incoming);
    console.log(`[ActivityMerge] ${incoming.source} workout "${incoming.name}" merged into activity ${match.id} for user ${userId}`);
    return match.id;
  } catch (e) {
    // A failed merge must never lose the workout: fall back to inserting it.
    console.error("[ActivityMerge] merge failed, inserting instead:", e.message);
    return null;
  }
}

/**
 * Folds an already-stored duplicate into the row that stays (for the clean-up
 * of activities imported before merging existed). The duplicate is hidden, not
 * deleted, and its kudos and comments move to the row that stays.
 */
async function foldExisting(keep, dup) {
  const source = dup.strava_activity_id ? "strava" : dup.suunto_workout_id ? "suunto" : dup.healthkit_workout_id ? "healthkit" : "manual";
  // Source ids are unique per athlete and must end up on the row that stays (or
  // the next import from that source would update the hidden one), so the
  // duplicate gives them up first.
  await run(
    `UPDATE activities SET is_hidden = 1, rooka_score = 0, strava_activity_id = NULL, healthkit_workout_id = NULL, suunto_workout_id = NULL,
       linked_activity_id = ?, linked_activity_name = ? WHERE id = ?`,
    [keep.id, keep.name || null, dup.id]
  );
  await mergeInto(keep, { ...dup, source, sourceId: dup[SOURCE_COLUMN[source]] });
  for (const col of Object.values(SOURCE_COLUMN)) {
    if (dup[col]) await run(`UPDATE activities SET ${col} = COALESCE(${col}, ?) WHERE id = ?`, [dup[col], keep.id]);
  }
  await run(`UPDATE OR IGNORE kudos SET activity_id = ? WHERE activity_id = ?`, [keep.id, dup.id]);
  await run(`DELETE FROM kudos WHERE activity_id = ?`, [dup.id]);
  await run(`UPDATE activity_comments SET activity_id = ? WHERE activity_id = ?`, [String(keep.id), String(dup.id)]);
}

/**
 * Clears the fake Strava ids an old start-up migration put on Apple Health and
 * Suunto workouts (their own row id copied into strava_activity_id). Those made
 * an Apple Watch run look like a second Strava activity, so it was never merged.
 */
async function repairFakeStravaIds() {
  try {
    const res = await run(
      `UPDATE activities SET strava_activity_id = NULL
        WHERE strava_activity_id = CAST(id AS TEXT)
          AND (healthkit_workout_id IS NOT NULL OR suunto_workout_id IS NOT NULL)`
    );
    if (res.changes > 0) console.log(`[ActivityMerge] Cleared fake Strava ids from ${res.changes} Apple Health/Suunto workouts.`);
    return res.changes;
  } catch (e) {
    console.warn("[ActivityMerge] fake Strava id repair skipped:", e.message);
    return 0;
  }
}
// After db.js has added its columns.
if (process.env.NODE_ENV !== "test") setTimeout(repairFakeStravaIds, 3000).unref();

module.exports = { repairFakeStravaIds, absorbIfDuplicate, findDuplicate, isSameWorkout, mergedFields, foldExisting, sportFamily, SOURCE_RANK };
