/**
 * Season plan: the road from today to the athlete's main race, one row per week.
 *
 * This is the single authority on training phases. The app only displays what
 * comes out of here (GET /api/season), the weekly AI planner fills each week in
 * within its targets, and the coach chat reads the phase from here too. There is
 * deliberately no second copy of these rules on the client.
 *
 * The rules are plain arithmetic, not AI:
 * - Phases count back from race day per event (taper, peak, build; base before).
 * - Weekly volume grows at most 8% (and at most +5 km for run events) on loading
 *   weeks, and never beyond what the athlete's weekly availability allows.
 * - Every 4th week is a recovery week (every 3rd from age 50), counted back from
 *   the taper so the week before the taper is always a full week.
 * - The long session(s) grow evenly over the loading weeks and peak in the last
 *   one before the taper, capped by the athlete's longest available day.
 * - The starting point is what the athlete actually did in the last 4 weeks.
 *
 * Life comes first: when availability is below what the event usually needs, the
 * plan stays inside it and is flagged `timeLimited`, so the coach prioritises the
 * sessions that matter most instead of asking for time the athlete doesn't have.
 */
const crypto = require("crypto");
// (dedupeActivities below is shared with achievements.js)
const db = require("./db");

// ---------------------------------------------------------------------------
// Event catalogue
// ---------------------------------------------------------------------------
// unit: 'km' (weekly running km) or 'min' (weekly training minutes).
// taper: volume factors for the final weeks, relative to the last full week;
//        the last entry is race week (excluding the race itself).
// peakWeeks/buildWeeks: phase lengths before the taper; base fills the rest.
// minWeeks: below this the build is "short" and the goal check says so.
// recommendedPeak: what this event usually asks for at peak (same unit as
//        volume); availability below 85% of it marks the plan time-limited.
// long: the long sessions and where they peak.
const EVENT_TYPES = {
  "5k": { discipline: "running", unit: "km", distanceKm: 5, taper: [0.6], peakWeeks: 2, buildWeeks: 4, minWeeks: 4, recommendedPeak: 35, longShareCap: 0.4, long: [{ sport: "Run", unit: "km", peak: 12, fallbackStart: 5 }] },
  "10k": { discipline: "running", unit: "km", distanceKm: 10, taper: [0.6], peakWeeks: 2, buildWeeks: 5, minWeeks: 6, recommendedPeak: 40, longShareCap: 0.4, long: [{ sport: "Run", unit: "km", peak: 14, fallbackStart: 6 }] },
  half: { discipline: "running", unit: "km", distanceKm: 21.0975, taper: [0.75, 0.5], peakWeeks: 3, buildWeeks: 5, minWeeks: 8, recommendedPeak: 50, longShareCap: 0.45, long: [{ sport: "Run", unit: "km", peak: 19, fallbackStart: 8 }] },
  marathon: { discipline: "running", unit: "km", distanceKm: 42.195, taper: [0.8, 0.6, 0.35], peakWeeks: 3, buildWeeks: 6, minWeeks: 12, recommendedPeak: 60, longShareCap: 0.55, long: [{ sport: "Run", unit: "km", peak: 30, fallbackStart: 10 }] },
  sprint_tri: { discipline: "triathlon", unit: "min", taper: [0.6], peakWeeks: 2, buildWeeks: 4, minWeeks: 6, recommendedPeak: 360, long: [{ sport: "Bike", unit: "min", peak: 75, fallbackStart: 45 }, { sport: "Run", unit: "km", peak: 8, fallbackStart: 4 }] },
  olympic_tri: { discipline: "triathlon", unit: "min", taper: [0.7, 0.45], peakWeeks: 3, buildWeeks: 6, minWeeks: 8, recommendedPeak: 480, long: [{ sport: "Bike", unit: "min", peak: 120, fallbackStart: 60 }, { sport: "Run", unit: "km", peak: 12, fallbackStart: 5 }] },
  "70.3": { discipline: "triathlon", unit: "min", taper: [0.7, 0.4], peakWeeks: 3, buildWeeks: 8, minWeeks: 12, recommendedPeak: 600, long: [{ sport: "Bike", unit: "min", peak: 210, fallbackStart: 60 }, { sport: "Run", unit: "km", peak: 18, fallbackStart: 6 }] },
  ironman: { discipline: "triathlon", unit: "min", taper: [0.75, 0.55, 0.35], peakWeeks: 3, buildWeeks: 10, minWeeks: 20, recommendedPeak: 840, long: [{ sport: "Bike", unit: "min", peak: 330, fallbackStart: 90 }, { sport: "Run", unit: "km", peak: 30, fallbackStart: 8 }] },
  hyrox: { discipline: "hyrox", unit: "min", taper: [0.6], peakWeeks: 2, buildWeeks: 6, minWeeks: 8, recommendedPeak: 360, long: [{ sport: "Run", unit: "km", peak: 14, fallbackStart: 5 }] },
  other: { discipline: "general", unit: "min", taper: [0.7], peakWeeks: 2, buildWeeks: 6, minWeeks: 6, recommendedPeak: 360, long: [{ sport: "Any", unit: "min", peak: 120, fallbackStart: 45 }] },
};

// How a time-based week splits over sports, per phase. Shares, summing to 1.
const SPORT_SPLITS = {
  triathlon: {
    base: { Swim: 0.2, Bike: 0.45, Run: 0.35 },
    build: { Swim: 0.18, Bike: 0.5, Run: 0.32 },
    peak: { Swim: 0.15, Bike: 0.52, Run: 0.33 },
    taper: { Swim: 0.2, Bike: 0.45, Run: 0.35 },
  },
  hyrox: {
    base: { Run: 0.5, Strength: 0.3, Hybrid: 0.2 },
    build: { Run: 0.45, Strength: 0.25, Hybrid: 0.3 },
    peak: { Run: 0.4, Strength: 0.2, Hybrid: 0.4 },
    taper: { Run: 0.45, Strength: 0.2, Hybrid: 0.35 },
  },
};

const GROWTH = 1.08;
const MAX_STEP_KM = 5;
const RECOVERY_FACTOR = 0.75;
const RECOVERY_LONG_FACTOR = 0.7;
const TAPER_LONG_FACTORS = [0.8, 0.55];
const MAX_WEEKS = 52;
const DEFAULT_EASY_PACE_MIN_PER_KM = 6.5;
const DEFAULT_START = { km: 15, min: 180 };

function detectEventType(name = "", discipline = "") {
  const s = String(name || "").toLowerCase();
  if (/hyrox|deka/.test(s)) return "hyrox";
  if (/\b70[.,]3\b|half[\s-]*iron|halve\s*triatlon/.test(s)) return "70.3";
  if (/ironman|140[.,]6|\bfull\s*distance|hele\s*triatlon/.test(s)) return "ironman";
  if (/olympi|standard\s*distance|kwart\s*triatlon|\bod\b/.test(s)) return "olympic_tri";
  if (/sprint/.test(s) && /tri/.test(s)) return "sprint_tri";
  if (/triat|triathlon|duathlon/.test(s)) return "olympic_tri";
  if (/half|halve|halbmarathon|semi|medio/.test(s) && /mara/.test(s)) return "half";
  if (/21[.,]1|21\s*km/.test(s)) return "half";
  if (/mara/.test(s)) return "marathon";
  if (/\b10\s*k(m)?\b|10\s*(km|kilomet)|tien\s*km|zevenheuvelen|damloop|dam\s*tot/.test(s)) return "10k";
  if (/\b5\s*k(m)?\b|5\s*(km|kilomet)|parkrun/.test(s)) return "5k";
  if (discipline === "triathlon") return "olympic_tri";
  if (discipline === "hyrox") return "hyrox";
  if (discipline === "running") return "10k";
  return "other";
}

// ---------------------------------------------------------------------------
// Dates (Europe/Amsterdam calendar days, Monday-based weeks)
// ---------------------------------------------------------------------------
function todayStr(now = new Date()) {
  return new Date(now).toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const CONTINUE_WITHIN_DAYS = 7;

/** Whole days from dateA to dateB (YYYY-MM-DD). */
function daysBetween(dateA, dateB) {
  return Math.round((new Date(String(dateB).slice(0, 10) + "T12:00:00Z") - new Date(String(dateA).slice(0, 10) + "T12:00:00Z")) / 86400000);
}

function mondayOf(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getUTCDay(); // 0 = Sunday
  return addDays(dateStr, dow === 0 ? -6 : 1 - dow);
}
function weeksBetween(mondayA, mondayB) {
  return Math.round((new Date(mondayB + "T12:00:00Z") - new Date(mondayA + "T12:00:00Z")) / (7 * 86400000));
}

// ---------------------------------------------------------------------------
// Pure skeleton
// ---------------------------------------------------------------------------
/**
 * @param {object} p
 * @param {string} p.eventType
 * @param {number} p.weeks            weeks from the first week up to and including race week
 * @param {number} p.weekOffset       how many plan weeks already passed (keeps indexes stable on regeneration)
 * @param {object} p.start            { volume, long: [values aligned with config.long] }
 * @param {number|null} p.capVolume   weekly cap in the event unit, or null
 * @param {Array<number|null>} p.capLong   per long session cap, or null
 * @param {number} p.recoveryEvery    4 (3 loading + 1 recovery) or 3
 * @returns {Array<object>}
 */
function computeSkeleton({ eventType, weeks, weekOffset = 0, start, capVolume = null, capLong = [], recoveryEvery = 4, minPhase = null }) {
  const cfg = EVENT_TYPES[eventType] || EVENT_TYPES.other;
  const total = weekOffset + weeks;
  const nTaper = Math.min(cfg.taper.length, total);
  const taperStart = total - nTaper; // absolute week index (0-based) of the first taper week
  const peakStart = Math.max(0, taperStart - cfg.peakWeeks);
  const buildStart = Math.max(0, peakStart - cfg.buildWeeks);

  const phaseOf = (i) => {
    if (i === total - 1) return "race";
    if (i >= taperStart) return "taper";
    if (i >= peakStart) return "peak";
    if (i >= buildStart) return "build";
    // A plan that continues after a goal change (a shorter event builds later) does not
    // drop an athlete who already reached the build phase back to base.
    if (minPhase && minPhase !== "base") return "build";
    return "base";
  };
  // Counted back from the taper; a recovery week needs at least two full weeks before it.
  const isRecovery = (i) => i < taperStart && i >= 2 && (taperStart - i) % recoveryEvery === 0;

  // Loading weeks from now until the taper; the long sessions ramp evenly over them.
  const loading = [];
  for (let i = weekOffset; i < taperStart; i++) if (!isRecovery(i)) loading.push(i);
  const K = Math.max(1, loading.length - 1);

  const longPeaks = cfg.long.map((l, j) => {
    const cap = capLong[j];
    return cap ? Math.min(l.peak, cap) : l.peak;
  });
  const ramp = (startVal, peakVal, i) => {
    const k = loading.indexOf(i);
    const from = Math.min(startVal, peakVal);
    return from + (peakVal - from) * (k / K);
  };

  const rows = [];
  let lastLoadVol = capVolume ? Math.min(start.volume, capVolume) : start.volume;
  let lastLoadLong = cfg.long.map((_, j) => Math.min(start.long[j], longPeaks[j]));
  let firstLoading = true;

  for (let i = weekOffset; i < total; i++) {
    const phase = phaseOf(i);
    let volume;
    let long;
    if (i >= taperStart) {
      const t = i - taperStart;
      volume = lastLoadVol * cfg.taper[t];
      long = phase === "race" ? cfg.long.map(() => 0) : lastLoadLong.map((v) => v * (TAPER_LONG_FACTORS[t] ?? 0.5));
    } else if (isRecovery(i)) {
      volume = lastLoadVol * RECOVERY_FACTOR;
      long = lastLoadLong.map((v) => v * RECOVERY_LONG_FACTOR);
    } else {
      if (!firstLoading) {
        let grown = lastLoadVol * GROWTH;
        if (cfg.unit === "km") grown = Math.min(grown, lastLoadVol + MAX_STEP_KM);
        volume = capVolume ? Math.min(grown, capVolume) : grown;
      } else {
        volume = lastLoadVol;
      }
      firstLoading = false;
      long = cfg.long.map((l, j) => ramp(start.long[j], longPeaks[j], i));
      if (cfg.unit === "km" && cfg.longShareCap) {
        // Keep the long run in proportion to the week, but never below what the athlete already ran.
        long = long.map((v, j) =>
          cfg.long[j].sport === "Run" ? Math.min(v, Math.max(volume * cfg.longShareCap, Math.min(start.long[j], longPeaks[j]))) : v
        );
      }
      lastLoadVol = volume;
      lastLoadLong = long;
    }

    const split = SPORT_SPLITS[cfg.discipline]
      ? SPORT_SPLITS[cfg.discipline][phase === "race" ? "taper" : phase]
      : null;

    rows.push({
      index: i + 1,
      total,
      phase,
      isRecovery: isRecovery(i),
      isCheckpoint: false,
      unit: cfg.unit,
      volume: Math.round(volume),
      longSessions: cfg.long.map((l, j) => ({
        sport: l.sport,
        unit: l.unit,
        value: l.unit === "km" ? Math.round(long[j] * 2) / 2 : Math.round(long[j] / 5) * 5,
      })),
      split,
    });
  }

  // Checkpoints: the last full week of base and of build (a benchmark retest).
  for (const ph of ["base", "build"]) {
    const candidates = rows.filter((r) => r.phase === ph && !r.isRecovery);
    const phaseLength = rows.filter((r) => r.phase === ph).length;
    if (candidates.length > 0 && phaseLength >= 3) candidates[candidates.length - 1].isCheckpoint = true;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Inputs from the database
// ---------------------------------------------------------------------------
const dbAll = (sql, params = []) => new Promise((resolve) => db.all(sql, params, (err, rows) => resolve(err || !rows ? [] : rows)));
const dbGet = (sql, params = []) => new Promise((resolve) => db.get(sql, params, (err, row) => resolve(err ? null : row || null)));
const dbRun = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (err) { return err ? reject(err) : resolve(this); }));

function ensureTables() {
  db.serialize(() => {
    db.run(`ALTER TABLE milestones ADD COLUMN event_type TEXT`, () => {});
    db.run(`CREATE TABLE IF NOT EXISTS season_weeks (
      user_id INTEGER NOT NULL,
      week_start TEXT NOT NULL,
      week_index INTEGER NOT NULL,
      total_weeks INTEGER NOT NULL,
      phase TEXT NOT NULL,
      is_recovery INTEGER DEFAULT 0,
      is_checkpoint INTEGER DEFAULT 0,
      unit TEXT NOT NULL,
      target_volume REAL,
      long_sessions_json TEXT,
      split_json TEXT,
      PRIMARY KEY (user_id, week_start)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS season_meta (
      user_id INTEGER PRIMARY KEY,
      inputs_hash TEXT,
      event_type TEXT,
      race_name TEXT,
      race_date TEXT,
      plan_start TEXT,
      flags_json TEXT,
      start_json TEXT,
      generated_at TEXT
    )`);
  });
}
ensureTables();

const RUN_TYPES = new Set(["run", "virtualrun", "trailrun", "treadmill"]);
const RIDE_TYPES = new Set(["ride", "virtualride", "bike", "ebikeride", "gravelride", "mountainbikeride", "cycling"]);
const sportKey = (t) => String(t || "").toLowerCase().replace(/\s+/g, "");

/**
 * The same workout often arrives twice (Strava and Apple Health). Treat rows of
 * the same sport starting within 10 minutes of each other as one, keeping the
 * longer.
 */
function dedupeActivities(acts) {
  const sorted = [...acts].sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
  const out = [];
  for (const a of sorted) {
    const t = new Date(a.start_date).getTime();
    const dup = out.find(
      (b) => sportKey(b.sport_type) === sportKey(a.sport_type) && Math.abs(new Date(b.start_date).getTime() - t) <= 10 * 60000
    );
    if (!dup) out.push(a);
    else if ((a.moving_time_min || 0) > (dup.moving_time_min || 0)) Object.assign(dup, a);
  }
  return out;
}

async function getMainRaceGoal(userId) {
  const rows = await dbAll(
    `SELECT id, name, date, is_main, goal_type, target_mode, target_value, event_type FROM milestones
     WHERE user_id = ? AND date IS NOT NULL AND date != '' AND COALESCE(goal_type, 'race') = 'race'
     ORDER BY is_main DESC, date ASC`,
    [userId]
  );
  const today = todayStr();
  const future = rows.filter((r) => String(r.date).slice(0, 10) >= today);
  return future.find((r) => r.is_main === 1) || future[0] || null;
}

function parseAvailabilityMinutes(raw) {
  let obj = {};
  try {
    obj = typeof raw === "string" ? JSON.parse(raw || "{}") : raw || {};
  } catch (_) {
    obj = {};
  }
  const days = Object.values(obj || {});
  if (days.length === 0) return { weekly: null, longestDay: null };
  let weekly = 0;
  let longestDay = 0;
  for (const d of days) {
    const maxM = Number(d?.maxMinutes ?? d?.max_minutes);
    const blocked = d?.available === false || d?.status === "blocked" || maxM === 0;
    if (blocked) continue;
    const m = Number.isFinite(maxM) && maxM > 0 ? maxM : 60;
    weekly += m;
    longestDay = Math.max(longestDay, m);
  }
  return weekly > 0 ? { weekly, longestDay } : { weekly: null, longestDay: null };
}

async function gatherInputs(userId) {
  const user = await dbGet(`SELECT id, training_availability, date_of_birth FROM users WHERE id = ?`, [userId]);
  const goal = await getMainRaceGoal(userId);
  if (!user || !goal) return null;
  const eventType = goal.event_type && EVENT_TYPES[goal.event_type] ? goal.event_type : detectEventType(goal.name);
  const cfg = EVENT_TYPES[eventType];

  const since = addDays(todayStr(), -28);
  const acts = dedupeActivities(await dbAll(
    `SELECT sport_type, distance_km, moving_time_min, start_date FROM activities
     WHERE user_id = ? AND substr(start_date, 1, 10) >= ? AND (is_hidden IS NULL OR is_hidden = 0)`,
    [userId, since]
  ));
  const runs = acts.filter((a) => RUN_TYPES.has(sportKey(a.sport_type)));
  const rides = acts.filter((a) => RIDE_TYPES.has(sportKey(a.sport_type)));

  // Easy pace from typical runs (median pace of runs of 3 km+), clamped to sane values.
  const paces = runs
    .filter((r) => r.distance_km >= 3 && r.moving_time_min > 0)
    .map((r) => r.moving_time_min / r.distance_km)
    .sort((a, b) => a - b);
  let easyPace = paces.length ? paces[Math.floor(paces.length / 2)] : DEFAULT_EASY_PACE_MIN_PER_KM;
  easyPace = Math.min(8.5, Math.max(4.5, easyPace));

  // Start from the busier of the 4-week average and 85% of the busiest week, so a
  // quiet week (or a recovery week) doesn't drag the starting point down.
  const weekOf = (a) => mondayOf(String(a.start_date).slice(0, 10));
  const perWeek = (list, f) => {
    const m = new Map();
    for (const a of list) m.set(weekOf(a), (m.get(weekOf(a)) || 0) + (f(a) || 0));
    return [...m.values()];
  };
  const startOf = (weeks) => Math.max(weeks.reduce((x, y) => x + y, 0) / 4, Math.max(0, ...weeks) * 0.85);
  const runKm = startOf(perWeek(runs, (r) => r.distance_km));
  const totalMin = startOf(perWeek(acts, (a) => a.moving_time_min));
  const longestRunKm = runs.reduce((m, r) => Math.max(m, r.distance_km || 0), 0);
  const longestRideMin = rides.reduce((m, r) => Math.max(m, r.moving_time_min || 0), 0);
  const longestAnyMin = acts.reduce((m, a) => Math.max(m, a.moving_time_min || 0), 0);

  const hasHistory = cfg.unit === "km" ? runKm >= 3 : totalMin >= 60;
  const startVolume = hasHistory ? (cfg.unit === "km" ? runKm : totalMin) : DEFAULT_START[cfg.unit];
  const startLong = cfg.long.map((l) => {
    // In running plans the long run starts at no more than 60% of the starting week.
    if (l.sport === "Run" && cfg.unit === "km") return Math.min(longestRunKm >= 2 ? longestRunKm : l.fallbackStart, Math.max(3, startVolume * 0.6));
    if (l.sport === "Run") return longestRunKm >= 2 ? longestRunKm : l.fallbackStart;
    if (l.sport === "Bike") return longestRideMin >= 20 ? longestRideMin : l.fallbackStart;
    return longestAnyMin >= 20 ? longestAnyMin : l.fallbackStart;
  });

  const avail = parseAvailabilityMinutes(user.training_availability);
  let capVolume = null;
  let capLong = cfg.long.map(() => null);
  if (avail.weekly) {
    capVolume = cfg.unit === "km" ? (avail.weekly * 0.9) / easyPace : avail.weekly;
    capLong = cfg.long.map((l) => (l.unit === "km" ? avail.longestDay / easyPace : avail.longestDay));
  }
  // Without a schedule, the plan never asks for more than the event usually needs.
  const effectiveCap = capVolume ?? cfg.recommendedPeak;

  const ageYears = (() => {
    if (!user.date_of_birth) return null;
    const d = new Date(user.date_of_birth);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    let a = now.getFullYear() - d.getFullYear();
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--;
    return a;
  })();
  const recoveryEvery = ageYears !== null && ageYears >= 50 ? 3 : 4;

  return {
    goal,
    eventType,
    cfg,
    raceDate: String(goal.date).slice(0, 10),
    start: { volume: Math.min(startVolume, effectiveCap), long: startLong },
    estimatedStart: !hasHistory,
    capVolume: effectiveCap,
    capLong,
    recoveryEvery,
    easyPace,
    timeLimited: Boolean(capVolume) && capVolume < cfg.recommendedPeak * 0.85,
    // The longest available day keeps a long session well below what the event usually builds to.
    longLimitedBy: cfg.long
      .map((l, j) => (capLong[j] && capLong[j] < l.peak * 0.85 ? { sport: l.sport, unit: l.unit, cap: Math.round(capLong[j] * (l.unit === "km" ? 2 : 1)) / (l.unit === "km" ? 2 : 1), usual: l.peak, longestDayMinutes: avail.longestDay } : null))
      .filter(Boolean),
    availabilityHash: JSON.stringify(avail),
  };
}

function hashInputs(inputs) {
  return crypto
    .createHash("sha1")
    .update(JSON.stringify([inputs.eventType, inputs.raceDate, inputs.goal.name, inputs.availabilityHash, inputs.recoveryEvery]))
    .digest("hex");
}

// ---------------------------------------------------------------------------
// Generation & reads
// ---------------------------------------------------------------------------
/**
 * (Re)builds the season from the current week on. Weeks already past are kept
 * as history, so indexes stay stable and the Goal page can show what was done.
 */
async function regenerateSeason(userId, inputs = null) {
  const inp = inputs || (await gatherInputs(userId));
  if (!inp) {
    await dbRun(`DELETE FROM season_weeks WHERE user_id = ?`, [userId]).catch(() => {});
    await dbRun(`DELETE FROM season_meta WHERE user_id = ?`, [userId]).catch(() => {});
    return null;
  }
  const thisMonday = mondayOf(todayStr());
  const raceMonday = mondayOf(inp.raceDate);
  if (raceMonday < thisMonday) return null;

  const meta = await dbGet(`SELECT * FROM season_meta WHERE user_id = ?`, [userId]);
  // The same season continues when the race moves by a week or less, even if the event
  // changes too (a 70.3 becomes a full distance): the weeks already done, base and build
  // included, stay as they were and only this week and the rest are rebuilt for the
  // new date or event. Moving the race further is a new goal and starts over.
  const continues = Boolean(
    meta &&
      meta.race_date &&
      meta.plan_start &&
      meta.plan_start <= thisMonday &&
      Math.abs(daysBetween(meta.race_date, inp.raceDate)) <= CONTINUE_WITHIN_DAYS &&
      // Same kind of volume (km for running events, minutes otherwise), so the weeks
      // already done still compare with the new ones. Running to triathlon is a new plan.
      (EVENT_TYPES[meta.event_type] || EVENT_TYPES.other).unit === inp.cfg.unit
  );
  let planStart = continues ? meta.plan_start : thisMonday;
  let weekOffset = weeksBetween(planStart, thisMonday);
  let weeksLeft = weeksBetween(thisMonday, raceMonday) + 1;
  if (weekOffset + weeksLeft > MAX_WEEKS) {
    // Very long horizons: only the last MAX_WEEKS weeks are planned in detail.
    planStart = addDays(raceMonday, -7 * (MAX_WEEKS - 1));
    if (planStart < thisMonday) planStart = thisMonday;
    weekOffset = weeksBetween(planStart, thisMonday);
    weeksLeft = Math.min(weeksLeft, MAX_WEEKS - weekOffset);
  }

  // The furthest phase already behind the athlete in this season.
  const pastPhases = continues
    ? (await dbAll(`SELECT phase FROM season_weeks WHERE user_id = ? AND week_start >= ? AND week_start < ?`, [userId, planStart, thisMonday])).map((r) => r.phase)
    : [];
  const minPhase = pastPhases.some((p) => p !== "base") ? "build" : null;

  const rows = computeSkeleton({
    eventType: inp.eventType,
    weeks: weeksLeft,
    weekOffset,
    start: inp.start,
    capVolume: inp.capVolume,
    capLong: inp.capLong,
    recoveryEvery: inp.recoveryEvery,
    minPhase,
  });

  const flags = {
    timeLimited: inp.timeLimited,
    longLimitedBy: inp.longLimitedBy,
    shortBuild: weekOffset + weeksLeft < inp.cfg.minWeeks,
    estimatedStart: inp.estimatedStart,
    recoveryEvery: inp.recoveryEvery,
    recommendedPeak: inp.cfg.recommendedPeak,
    capVolume: Math.round(inp.capVolume),
    easyPace: Math.round(inp.easyPace * 100) / 100,
  };

  await dbRun(`DELETE FROM season_weeks WHERE user_id = ? AND (week_start >= ? OR week_start < ?)`, [userId, thisMonday, planStart]);
  if (!continues) await dbRun(`DELETE FROM season_weeks WHERE user_id = ?`, [userId]);
  for (const r of rows) {
    const weekStart = addDays(planStart, (r.index - 1) * 7);
    await dbRun(
      `INSERT OR REPLACE INTO season_weeks (user_id, week_start, week_index, total_weeks, phase, is_recovery, is_checkpoint, unit, target_volume, long_sessions_json, split_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, weekStart, r.index, r.total, r.phase, r.isRecovery ? 1 : 0, r.isCheckpoint ? 1 : 0, r.unit, r.volume, JSON.stringify(r.longSessions), r.split ? JSON.stringify(r.split) : null]
    );
  }
  // Past rows keep their own total; align it so the timeline reads as one plan.
  await dbRun(`UPDATE season_weeks SET total_weeks = ? WHERE user_id = ?`, [rows.length ? rows[0].total : 0, userId]);

  await dbRun(
    `INSERT OR REPLACE INTO season_meta (user_id, inputs_hash, event_type, race_name, race_date, plan_start, flags_json, start_json, generated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [userId, hashInputs(inp), inp.eventType, inp.goal.name, inp.raceDate, planStart, JSON.stringify(flags), JSON.stringify(inp.start)]
  );
  return true;
}

/**
 * Regenerates when the inputs changed (goal, date, event type, availability,
 * age band) or when no plan exists yet. Returns true if it regenerated.
 */
async function ensureSeasonFresh(userId) {
  const inp = await gatherInputs(userId);
  if (!inp) {
    await regenerateSeason(userId, null);
    return false;
  }
  const meta = await dbGet(`SELECT inputs_hash FROM season_meta WHERE user_id = ?`, [userId]);
  const thisMonday = mondayOf(todayStr());
  const current = await dbGet(`SELECT 1 AS ok FROM season_weeks WHERE user_id = ? AND week_start = ?`, [userId, thisMonday]);
  if (!meta || meta.inputs_hash !== hashInputs(inp) || !current) {
    await regenerateSeason(userId, inp);
    return true;
  }
  return false;
}

/**
 * Weekly check (Sunday, before planning): if the last two weeks fell well short
 * of their targets, rebuild from what the athlete actually does, so the plan
 * follows their life instead of piling up missed volume.
 */
async function adaptSeasonToReality(userId) {
  await ensureSeasonFresh(userId);
  const thisMonday = mondayOf(todayStr());
  const prev = await dbAll(
    `SELECT week_start, unit, target_volume, is_recovery FROM season_weeks WHERE user_id = ? AND week_start < ? ORDER BY week_start DESC LIMIT 2`,
    [userId, addDays(thisMonday, 7)]
  );
  if (prev.length < 2) return false;
  let shortfall = 0;
  for (const w of prev) {
    const actual = await actualVolumeForWeek(userId, w.week_start, w.unit);
    if (w.target_volume > 0 && actual < w.target_volume * 0.7) shortfall++;
  }
  if (shortfall === 2) {
    await regenerateSeason(userId);
    return true;
  }
  return false;
}

async function actualVolumeForWeek(userId, weekStart, unit) {
  const acts = dedupeActivities(await dbAll(
    `SELECT sport_type, distance_km, moving_time_min FROM activities
     WHERE user_id = ? AND substr(start_date, 1, 10) >= ? AND substr(start_date, 1, 10) <= ? AND (is_hidden IS NULL OR is_hidden = 0)`,
    [userId, weekStart, addDays(weekStart, 6)]
  ));
  if (unit === "km") return acts.filter((a) => RUN_TYPES.has(sportKey(a.sport_type))).reduce((s, a) => s + (a.distance_km || 0), 0);
  return acts.reduce((s, a) => s + (a.moving_time_min || 0), 0);
}

async function getSeason(userId) {
  await ensureSeasonFresh(userId);
  const meta = await dbGet(`SELECT * FROM season_meta WHERE user_id = ?`, [userId]);
  if (!meta) return null;
  const rows = await dbAll(`SELECT * FROM season_weeks WHERE user_id = ? ORDER BY week_start ASC`, [userId]);
  const thisMonday = mondayOf(todayStr());
  const weeks = [];
  for (const r of rows) {
    const isPast = r.week_start < thisMonday;
    const isCurrent = r.week_start === thisMonday;
    weeks.push({
      weekStart: r.week_start,
      index: r.week_index,
      total: r.total_weeks,
      phase: r.phase,
      isRecovery: r.is_recovery === 1,
      isCheckpoint: r.is_checkpoint === 1,
      unit: r.unit,
      volume: r.target_volume,
      actualVolume: isPast || isCurrent ? Math.round(await actualVolumeForWeek(userId, r.week_start, r.unit)) : null,
      longSessions: safeJson(r.long_sessions_json, []),
      split: safeJson(r.split_json, null),
      isPast,
      isCurrent,
    });
  }
  const flags = safeJson(meta.flags_json, {});
  const cfg = EVENT_TYPES[meta.event_type] || EVENT_TYPES.other;
  return {
    eventType: meta.event_type,
    discipline: cfg.discipline,
    raceName: meta.race_name,
    raceDate: meta.race_date,
    daysToRace: Math.round((new Date(meta.race_date + "T12:00:00Z") - new Date(todayStr() + "T12:00:00Z")) / 86400000),
    unit: cfg.unit,
    flags,
    weeks,
    currentWeek: weeks.find((w) => w.isCurrent) || null,
  };
}

function safeJson(s, fallback) {
  try {
    return s ? JSON.parse(s) : fallback;
  } catch (_) {
    return fallback;
  }
}

const PHASE_LABELS = { base: "BASE", build: "BUILD", peak: "PEAK", taper: "TAPER", race: "RACE WEEK" };

/** Phase string in the shape the existing prompts use (BASE, BUILD, PEAK, TAPER, RACE WEEK). */
async function getSeasonPhaseLabel(userId) {
  const meta = await dbGet(`SELECT race_date FROM season_meta WHERE user_id = ?`, [userId]);
  if (meta && meta.race_date === todayStr()) return "RACE DAY";
  const row = await dbGet(`SELECT phase, is_recovery FROM season_weeks WHERE user_id = ? AND week_start = ?`, [userId, mondayOf(todayStr())]);
  if (!row) return null;
  return PHASE_LABELS[row.phase];
}

function formatLong(l) {
  if (!l || !l.value) return null;
  if (l.unit === "km") return `${l.sport === "Any" ? "longest session" : `long ${l.sport.toLowerCase()}`} ${l.value} km`;
  const h = Math.floor(l.value / 60);
  const m = String(Math.round(l.value % 60)).padStart(2, "0");
  return `${l.sport === "Any" ? "longest session" : `long ${l.sport.toLowerCase()}`} ${h}:${m} h`;
}

/**
 * The season block for the weekly planner prompt: where the athlete is, what the
 * week should add up to, and how to be smart when time is short.
 */
async function getSeasonPromptBlock(userId, weekStart) {
  await ensureSeasonFresh(userId);
  const meta = await dbGet(`SELECT * FROM season_meta WHERE user_id = ?`, [userId]);
  const w = await dbGet(`SELECT * FROM season_weeks WHERE user_id = ? AND week_start = ?`, [userId, weekStart]);
  if (!meta || !w) return "";
  const flags = safeJson(meta.flags_json, {});
  const longs = safeJson(w.long_sessions_json, []).map(formatLong).filter(Boolean);
  const split = safeJson(w.split_json, null);
  const volumeText = w.unit === "km" ? `${Math.round(w.target_volume)} km of running` : `${Math.floor(w.target_volume / 60)}:${String(Math.round(w.target_volume % 60)).padStart(2, "0")} h of training`;
  const splitText = split
    ? ` (roughly ${Object.entries(split).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(", ")})`
    : "";

  const lines = [
    `SEASON PLAN (fixed weekly targets; build this week inside them):`,
    `- Race: ${meta.race_name} on ${meta.race_date} (${meta.event_type}). This is week ${w.week_index} of ${w.total_weeks}, phase ${PHASE_LABELS[w.phase]}${w.is_recovery ? ", a RECOVERY WEEK (lighter, no hard intervals beyond short strides)" : ""}.`,
    `- Weekly target: about ${volumeText}${splitText}.`,
  ];
  if (longs.length) lines.push(`- Key long session(s) this week: ${longs.join("; ")}. Put them on the days with the most available time.`);
  if (w.is_checkpoint) lines.push(`- CHECKPOINT WEEK: include one benchmark retest (the same test as the athlete's baseline, e.g. a 5k time trial, 20-min ride test or 400m swim test) in place of a quality session, so progress is measured.`);
  if (w.phase === "race") lines.push(`- RACE WEEK: short, sharp and fresh. Nothing new. The race itself is on ${meta.race_date}; plan it as the race session.`);
  if (flags.timeLimited) {
    lines.push(
      `- TIME-LIMITED ATHLETE: their life allows about ${Math.round(flags.capVolume)}${w.unit === "km" ? " km" : " min"} a week, less than this event usually asks (${flags.recommendedPeak}${w.unit === "km" ? " km" : " min"}). Never ask for more time and never suggest a shorter event. Get the most out of the time they have:`,
      `  * Protect the key sessions first: the long session(s), one quality session per main sport${meta.event_type && /tri/.test(meta.event_type) || meta.event_type === "70.3" || meta.event_type === "ironman" ? ", and a brick (bike straight into a short run)" : ""}.`,
      `  * Shorten or drop easy filler sessions before touching key sessions.`,
      `  * Use intensity wisely: short, specific intervals give more per minute than long easy volume, but keep at least ~75% of time easy.`,
      `  * Combine where it helps (bricks, strength right after a run, commute rides if the athlete mentioned commuting).`
    );
  }
  if (flags.shortBuild) lines.push(`- SHORT BUILD: there is less time than this event normally needs. Prioritise arriving healthy and able to finish strongly over chasing volume.`);
  return lines.join("\n");
}

module.exports = {
  EVENT_TYPES,
  detectEventType,
  computeSkeleton,
  gatherInputs,
  regenerateSeason,
  ensureSeasonFresh,
  adaptSeasonToReality,
  getSeason,
  getSeasonPhaseLabel,
  getSeasonPromptBlock,
  actualVolumeForWeek,
  dedupeActivities,
  getMainRaceGoal,
  mondayOf,
  addDays,
  todayStr,
};
