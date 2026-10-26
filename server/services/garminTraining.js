/**
 * Garmin Training API (official connection): rooka's planned sessions as
 * structured workouts on the athlete's Garmin Connect calendar, and so on their
 * watch. Replaces the parked password push (pushWorkoutsToGarmin in
 * routes/integrations.js) for athletes on the official connection; the
 * connection and its tokens live in services/garmin.js.
 *
 * Each planned session becomes one workout plus one schedule on its date.
 * garmin_workouts maps rooka's key for the session (date, sport, n-th of that
 * sport that day) to Garmin's workout and schedule ids, the way trainerday_events
 * does for TrainerDay: a changed session updates the same workout in place, a
 * removed one is deleted, and source_hash (of the converted workout) skips
 * sessions that didn't change, so a sync with nothing new makes no API calls.
 * The athlete must have allowed WORKOUT_IMPORT on Garmin's consent page.
 *
 * Conversion (rooka steps_json -> one single-sport workout segment):
 *   Run -> RUNNING, Bike -> CYCLING, Swim -> LAP_SWIMMING (25 m pool, as the old
 *   push), Strength -> STRENGTH_TRAINING. Walks go out as RUNNING like before;
 *   other sports are not sent.
 *   time/time_sec -> TIME (s), distance -> DISTANCE (m), reps -> REPS (strength
 *   only), anything else -> OPEN (lap button). Swim rest -> FIXED_REST. A strength
 *   carry ("100 m") goes out as lap button with the distance in the step note.
 *   heart.rate.zone -> HEART_RATE: the athlete's own bpm band when their profile
 *   has one (same rule as the old push), else the zone number for the watch's
 *   zones. pace -> PACE in m/s (±5%, as liveCoach), power.exact -> POWER ±10%,
 *   power.zone -> the zone's watts from rooka's FTP zones, else the zone number.
 *   A bike step that names a cadence gets it as a secondary CADENCE target.
 *   Swim has no primary target: pace (per 100 m) goes out as a PACE_ZONE
 *   secondary target, a HR zone as a text intensity (SWIM_INSTRUCTION), and the
 *   stroke, kick/pull drill and equipment are read from the step name.
 *   Strength exercises match garmin_exercises.json (matchGarminExercise). That
 *   file also holds FIT SDK entries the Training API's exercise list doesn't
 *   have: those send only their category (or a close official exercise), with
 *   rooka's name in the step note.
 *
 * Limits: 100 steps per single-sport workout (a repeat counts as a step, its
 * children once each); longer sessions are cut with a final note. Repeats don't
 * nest on Garmin, so an inner repeat is unrolled. Starter tier allows 100 calls
 * per app per minute and 200 per athlete per day; both are counted here.
 */
const crypto = require("crypto");
const db = require("./db");
const garmin = require("./garmin");
const athleteZones = require("./athleteZones");

// Same override as services/garmin.js, for tests against a fake server.
const API_BASE = process.env.GARMIN_API_BASE || "https://apis.garmin.com";
const WORKOUT_IMPORT = "WORKOUT_IMPORT";
const PROVIDER = "rooka"; // workoutProvider / workoutSourceId, 20 chars max
const MAX_STEPS = 100;
const POOL_LENGTH_M = 25;
// How far ahead the calendar is kept in sync automatically (as TrainerDay).
const MIRROR_DAYS = 14;
const PACE_BAND = 0.05; // liveCoach RULES.paceBand
const POWER_BAND = 0.1; // liveCoach RULES.powerBand

const dbGet = (sql, params = []) =>
  new Promise((resolve, reject) => db.get(sql, params, (e, row) => (e ? reject(e) : resolve(row))));
const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) => db.all(sql, params, (e, rows) => (e ? reject(e) : resolve(rows || []))));
const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (e) {
      return e ? reject(e) : resolve(this);
    }),
  );

// ---------------------------------------------------------------------------
// Converter: rooka steps_json -> Training API workout
// ---------------------------------------------------------------------------

/** rooka sport -> Garmin workout sport, or null when it isn't sent. */
function garminSport(sport) {
  const s = String(sport || "").trim().toLowerCase();
  if (["run", "running", "walk", "walking", "hike", "hiking", "trail", "treadmill"].includes(s)) return "RUNNING";
  if (["bike", "cycling", "cycle", "biking", "ride", "virtualride", "indoor cycling", "spin"].includes(s)) return "CYCLING";
  if (["swim", "swimming"].includes(s)) return "LAP_SWIMMING";
  if (["strength", "strength_training", "gym"].includes(s)) return "STRENGTH_TRAINING";
  return null;
}

/** Which of the athlete's zone tables a Garmin sport uses. */
const ZONE_SPORT = { RUNNING: "Run", CYCLING: "Bike", LAP_SWIMMING: "Swim", STRENGTH_TRAINING: "Strength" };

const INTENSITY = {
  warmup: "WARMUP",
  cooldown: "COOLDOWN",
  interval: "INTERVAL",
  drill: "INTERVAL",
  active: "ACTIVE",
  other: "ACTIVE",
  recovery: "RECOVERY",
  rest: "REST",
};

// HR zone -> the swim text intensity (1 recovery ... 7 all out) a swimmer can follow without a strap.
const SWIM_INSTRUCTION_BY_HR_ZONE = { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6 };

// Read from the step name, in the languages rooka plans in.
const STROKES = [
  ["IM", /\b(IM|medley|wisselslag|lagen|4 nages|estilos)\b/i],
  ["BACKSTROKE", /\b(backstroke|back|rugslag|rücken|dos|espalda)\b/i],
  ["BREASTSTROKE", /\b(breaststroke|breast|schoolslag|brust|brasse|braza)\b/i],
  ["BUTTERFLY", /\b(butterfly|fly|vlinderslag|schmetterling|delfin|papillon|mariposa)\b/i],
  ["FREESTYLE", /\b(freestyle|free|crawl|borstcrawl|kraul|freistil|crol|libre)\b/i],
  ["CHOICE", /\b(choice|keuze|wahl|choix)\b/i],
  ["MIXED", /\b(mixed|gemengd|gemischt)\b/i],
];
const EQUIPMENT = [
  ["SWIM_PULL_BUOY", /pull[\s-]?buoy|pullbuoy/i],
  ["SWIM_FINS", /\b(fins|flippers|vinnen|flossen|palmes|aletas)\b/i],
  ["SWIM_KICKBOARD", /\b(kick\s?board|plankje|schwimmbrett|planche)\b/i],
  ["SWIM_PADDLES", /\b(paddles|peddels|plaquettes|palas)\b/i],
  ["SWIM_SNORKEL", /\b(snorkel|schnorchel|tuba)\b/i],
];
const DRILLS = [
  ["KICK", /\b(kick|benen|beine|beinschlag|battements|patada)\b/i],
  ["PULL", /\b(pull|armen|arme|bras|brazos)\b|pull[\s-]?buoy/i],
];

function firstMatch(table, text) {
  const hit = table.find(([, re]) => re.test(text));
  return hit ? hit[0] : null;
}

// garmin_exercises.json entries the Training API's exercise list doesn't have (67):
// these "category as exercise" entries (the list does have PLANK/PLANK, SQUAT/SQUAT
// and a dozen more like them)...
const GENERIC_CATEGORIES = [
  "BANDED_EXERCISES", "BATTLE_ROPE", "BENCH_PRESS", "BIKE_OUTDOOR", "CALF_RAISE", "CARDIO", "CARRY", "CHOP",
  "CORE", "CURL", "DEADLIFT", "FLYE", "HIP_STABILITY", "HIP_SWING", "HYPEREXTENSION", "INDOOR_BIKE", "LADDER",
  "LATERAL_RAISE", "LEG_RAISE", "OLYMPIC_LIFT", "PLYO", "RUN_INDOOR", "SANDBAG", "SHOULDER_PRESS",
  "SHOULDER_STABILITY", "SHRUG", "SLED", "SLEDGE_HAMMER", "SUSPENSION", "TIRE", "TOTAL_BODY",
  "TRICEPS_EXTENSION", "WARM_UP",
];
// ...and these.
const NOT_IN_TRAINING_API = new Set([
  ...GENERIC_CATEGORIES.map((c) => `${c}/${c}`),
  "DEADLIFT/STRAIGHT_LEG_DEADLIFT", "OLYMPIC_LIFT/SNATCH", "SHRUG/UPRIGHT_ROW",
  "WARM_UP/ANKLE_CIRCLES", "WARM_UP/ANKLE_DORSIFLEXION_WITH_BAND", "WARM_UP/ANKLE_INTERNAL_ROTATION",
  "WARM_UP/ARM_CIRCLES", "WARM_UP/BENT_OVER_REACH_TO_SKY", "WARM_UP/BICEPS_STRETCH", "WARM_UP/CAT_CAMEL",
  "WARM_UP/ELBOW_TO_FOOT_LUNGE", "WARM_UP/FORWARD_AND_BACKWARD_LEG_SWINGS", "WARM_UP/GLUTES_STRETCH",
  "WARM_UP/GROINERS", "WARM_UP/INVERTED_HAMSTRING_STRETCH", "WARM_UP/LATERAL_DUCK_UNDER", "WARM_UP/NECK_TILTS",
  "WARM_UP/OPPOSITE_ARM_AND_LEG_BALANCE", "WARM_UP/QUADRUPED_ROCKING", "WARM_UP/REACH_ROLL_AND_LIFT",
  "WARM_UP/SHOULDER_CIRCLES", "WARM_UP/SIDE_TO_SIDE_LEG_SWINGS", "WARM_UP/SLEEPER_STRETCH", "WARM_UP/SLIDE_OUT",
  "WARM_UP/SWISS_BALL_HIP_CROSSOVER", "WARM_UP/SWISS_BALL_REACH_ROLL_AND_LIFT",
  "WARM_UP/SWISS_BALL_WINDSHIELD_WIPERS", "WARM_UP/THORACIC_ROTATION", "WARM_UP/WALKING_HIGH_KICKS",
  "WARM_UP/WALKING_HIGH_KNEES", "WARM_UP/WALKING_KNEE_HUGS", "WARM_UP/WALKING_LEG_CRADLES", "WARM_UP/WALKOUT",
  "WARM_UP/WALKOUT_FROM_PUSH_UP_POSITION",
]);
// ...of which these have an official exercise close enough to send instead.
// (Category alone would show an upright row as "Shrug".)
const OFFICIAL_ALIAS = {
  "SHRUG/UPRIGHT_ROW": "BARBELL_UPRIGHT_ROW",
  "WARM_UP/CAT_CAMEL": "STRETCH_CAT_COW",
  "WARM_UP/INVERTED_HAMSTRING_STRETCH": "STRETCH_HAMSTRING",
  "WARM_UP/NECK_TILTS": "STRETCH_NECK",
};

/** rooka exercise name -> { exerciseCategory, exerciseName } the Training API accepts, or null. */
function strengthExercise(name) {
  if (!name) return null;
  const match = require("./utils").matchGarminExercise(name);
  if (!match) return null;
  const cat = match.category_key;
  const key = `${cat}/${match.exercise_key}`;
  if (OFFICIAL_ALIAS[key]) return { exerciseCategory: cat, exerciseName: OFFICIAL_ALIAS[key] };
  if (NOT_IN_TRAINING_API.has(key)) return { exerciseCategory: cat, exerciseName: null };
  return { exerciseCategory: cat, exerciseName: match.exercise_key };
}

/** Seconds of a time step: minutes, unless it is clearly seconds (rule shared with liveCoach/workoutPlanning). */
function stepSeconds(step) {
  const v = Number(step.condition_value) || 0;
  if (step.condition_type === "time_sec") return Math.round(v);
  return Math.round(v > 180 && v % 30 === 0 ? v : v * 60);
}

const fmtDistance = (m) => (m >= 1000 ? `${Math.round(m / 100) / 10} km` : `${m} m`);
const fmtSeconds = (s) => (s % 60 === 0 ? `${s / 60} min` : s > 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min` : `${s} s`);

/** { durationType, durationValue, durationValueType } of one step, plus a note when the watch can't hold the goal. */
function durationOf(step, sport, isRest) {
  const swim = sport === "LAP_SWIMMING";
  const v = Number(step.condition_value) || 0;
  const open = (note) => ({ durationType: "OPEN", durationValue: null, durationValueType: null, note });
  if ((step.condition_type === "time" || step.condition_type === "time_sec") && v > 0) {
    const sec = Math.max(1, stepSeconds(step));
    if (swim && isRest) return { durationType: "FIXED_REST", durationValue: sec, durationValueType: null };
    // Timed swim steps: 1 to 59 minutes.
    if (swim && (sec < 60 || sec > 59 * 60)) return open(fmtSeconds(sec));
    return { durationType: "TIME", durationValue: sec, durationValueType: null };
  }
  if ((step.condition_type === "distance" || step.condition_type === "distance_km") && v > 0) {
    const m = Math.round(step.condition_type === "distance_km" ? v * 1000 : v);
    // Strength steps take time, reps or the lap button.
    if (sport === "STRENGTH_TRAINING") return open(fmtDistance(m));
    return { durationType: "DISTANCE", durationValue: m, durationValueType: "METER" };
  }
  if (step.condition_type === "reps" && v > 0) {
    if (sport === "STRENGTH_TRAINING") return { durationType: "REPS", durationValue: Math.round(v), durationValueType: null };
    return open(`${Math.round(v)}x`);
  }
  return open(null);
}

/** Seconds per km (run) or per 100 m (swim) from "4:10" / "1:45 /100m". */
function paceSeconds(value) {
  const m = String(value == null ? "" : value).match(/(\d+)[:.](\d{1,2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function numberIn(value) {
  const m = String(value == null ? "" : value).match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** "High Cadence Spin-Up (110-120 rpm)" -> { min: 110, max: 120 } (as services/trainerday.js). */
function cadenceOf(step) {
  const text = `${step.exerciseName || ""} ${step.cadence || ""}`;
  const range = text.match(/(\d{2,3})\s*[-–]\s*(\d{2,3})\s*rpm/i);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const single = text.match(/(\d{2,3})\s*rpm/i);
  return single ? { min: Number(single[1]) - 5, max: Number(single[1]) + 5 } : null;
}

function powerBand(powerZones, zone) {
  if (!Array.isArray(powerZones)) return null;
  const z = powerZones.find((b) => Number(b.zone) === Number(zone));
  if (!z || !(Number(z.min) > 0) || z.max == null || !(Number(z.max) > Number(z.min))) return null;
  return { min: Math.round(Number(z.min)), max: Math.round(Number(z.max)) };
}

const round2 = (x) => Math.round(x * 1000) / 1000;

/** Primary target of a run / bike step. Returns a note for targets the watch can't take. */
function primaryTarget(step, sport, ctx) {
  const tt = step.target_type;
  const zone = parseInt(step.zone, 10);
  const watts = numberIn(step.target_value);
  if (tt === "heart.rate.zone" && zone >= 1 && zone <= 5) {
    const band = athleteZones.hrBandForZone(ctx.hrZones, zone);
    return band
      ? { targetType: "HEART_RATE", targetValueLow: band.min, targetValueHigh: band.max }
      : { targetType: "HEART_RATE", targetValue: zone };
  }
  if (tt === "pace.exact" || tt === "pace.zone") {
    const sec = paceSeconds(step.target_value);
    if (sec > 0) {
      const speed = 1000 / sec;
      return {
        targetType: sport === "CYCLING" ? "SPEED" : "PACE",
        targetValueLow: round2(speed * (1 - PACE_BAND)),
        targetValueHigh: round2(speed * (1 + PACE_BAND)),
      };
    }
    return tt === "pace.zone" && zone ? { note: `Pace zone ${zone}` } : null;
  }
  // power.zone with a wattage in target_value is watts, as in liveCoach.
  if (tt === "power.exact" || (tt === "power.zone" && watts)) {
    if (!watts) return null;
    return { targetType: "POWER", targetValueLow: Math.round(watts * (1 - POWER_BAND)), targetValueHigh: Math.round(watts * (1 + POWER_BAND)) };
  }
  if (tt === "power.zone" && zone >= 1 && zone <= 7) {
    const band = powerBand(ctx.powerZones, zone);
    return band
      ? { targetType: "POWER", targetValueLow: band.min, targetValueHigh: band.max }
      : { targetType: "POWER", targetValue: zone };
  }
  return null;
}

function blankStep() {
  return {
    type: "WorkoutStep",
    stepOrder: 0,
    intensity: "INTERVAL",
    description: null,
    durationType: "OPEN",
    durationValue: null,
    durationValueType: null,
    targetType: "OPEN",
    targetValue: null,
    targetValueLow: null,
    targetValueHigh: null,
    targetValueType: null,
    secondaryTargetType: null,
    secondaryTargetValue: null,
    secondaryTargetValueLow: null,
    secondaryTargetValueHigh: null,
    secondaryTargetValueType: null,
    strokeType: null,
    drillType: null,
    equipmentType: null,
    exerciseCategory: null,
    exerciseName: null,
    weightValue: null,
    weightDisplayUnit: null,
  };
}

function isRestStep(step, sport) {
  const type = String(step.type || "").toLowerCase();
  if (type === "rest") return true;
  // A swim "recovery" by time is the rest at the wall; by distance it's an easy length.
  return sport === "LAP_SWIMMING" && type === "recovery" && step.condition_type !== "distance" && step.condition_type !== "distance_km";
}

/** One rooka step (not a repeat) -> Garmin WorkoutStep. */
function workoutStep(step, sport, ctx) {
  const out = blankStep();
  const type = String(step.type || "interval").toLowerCase();
  const rest = isRestStep(step, sport);
  const name = String(step.exerciseName || "").trim();
  const notes = [];
  if (name) notes.push(name);

  out.intensity = rest ? "REST" : INTENSITY[type] || "INTERVAL";
  const d = durationOf(step, sport, rest);
  out.durationType = d.durationType;
  out.durationValue = d.durationValue;
  out.durationValueType = d.durationValueType;
  if (d.note) notes.push(d.note);

  if (sport === "LAP_SWIMMING") {
    out.targetType = null; // swim targets go in the secondary slot
    if (!rest) {
      out.strokeType = firstMatch(STROKES, name);
      out.drillType = firstMatch(DRILLS, name);
      out.equipmentType = firstMatch(EQUIPMENT, name);
      const sec = (step.target_type === "pace.exact" || step.target_type === "pace.zone") && paceSeconds(step.target_value);
      const zone = parseInt(step.zone, 10);
      if (sec > 0) {
        const speed = 100 / sec; // swim pace is per 100 m
        out.secondaryTargetType = "PACE_ZONE";
        out.secondaryTargetValueLow = round2(speed * (1 - PACE_BAND));
        out.secondaryTargetValueHigh = round2(speed * (1 + PACE_BAND));
      } else if (step.target_type === "heart.rate.zone" && SWIM_INSTRUCTION_BY_HR_ZONE[zone]) {
        out.secondaryTargetType = "SWIM_INSTRUCTION";
        out.secondaryTargetValueLow = SWIM_INSTRUCTION_BY_HR_ZONE[zone];
        notes.push(`HR Z${zone}`);
      }
    }
  } else if (sport === "STRENGTH_TRAINING") {
    if (!rest) {
      const ex = strengthExercise(name);
      if (ex) Object.assign(out, ex);
      const kg = Number(step.weight);
      if (kg > 0) {
        out.weightValue = kg;
        out.weightDisplayUnit = "KILOGRAM";
      }
    }
  } else {
    const t = primaryTarget(step, sport, ctx);
    if (t && t.note) notes.push(t.note);
    else if (t) Object.assign(out, t);
    const cadence = sport === "CYCLING" ? cadenceOf(step) : null;
    if (cadence) {
      const c = { low: cadence.min, high: cadence.max == null ? cadence.min + 10 : cadence.max };
      if (out.targetType === "OPEN") Object.assign(out, { targetType: "CADENCE", targetValueLow: c.low, targetValueHigh: c.high });
      else Object.assign(out, { secondaryTargetType: "CADENCE", secondaryTargetValueLow: c.low, secondaryTargetValueHigh: c.high });
    }
  }

  out.description = notes.length ? notes.join(" · ").slice(0, 512) : null;
  return out;
}

/** The steps of a repeat, with any repeat nested inside it unrolled (Garmin's repeats don't nest). */
function flatInner(steps) {
  const out = [];
  for (const s of Array.isArray(steps) ? steps : []) {
    if (!s) continue;
    if (s.type === "repeat") {
      const n = Math.max(1, parseInt(s.iterations || s.times || 1, 10) || 1);
      const inner = flatInner(s.steps);
      for (let i = 0; i < n; i++) out.push(...inner);
    } else out.push(s);
  }
  return out;
}

const stepCount = (s) => (s.type === "WorkoutRepeatStep" ? 1 + s.steps.length : 1);

/** rooka steps -> Garmin steps for one segment, within MAX_STEPS, numbered in order. */
function toGarminSteps(steps, sport, ctx = {}) {
  const swim = sport === "LAP_SWIMMING";
  const list = (Array.isArray(steps) ? steps : []).filter(Boolean);
  const out = [];
  list.forEach((s, i) => {
    if (s.type !== "repeat") {
      out.push(workoutStep(s, sport, ctx));
      return;
    }
    const inner = flatInner(s.steps);
    if (inner.length === 0) return;
    const times = Math.max(1, parseInt(s.iterations || s.times || 1, 10) || 1);
    if (times === 1) {
      inner.forEach((x) => out.push(workoutStep(x, sport, ctx)));
      return;
    }
    out.push({
      type: "WorkoutRepeatStep",
      stepOrder: 0,
      repeatType: "REPEAT_UNTIL_STEPS_CMPLT",
      repeatValue: times,
      skipLastRestStep: swim,
      steps: inner.map((x) => workoutStep(x, sport, ctx)),
    });
    // A swim watch skips the rest after the last rep; Garmin's advice is to
    // repeat that rest after the block when more swimming follows.
    const last = inner[inner.length - 1];
    const next = list[i + 1];
    if (swim && isRestStep(last, sport) && next && !isRestStep(next, sport)) out.push(workoutStep(last, sport, ctx));
  });

  // Over Garmin's step limit: keep what fits and say where the rest is.
  let total = out.reduce((n, s) => n + stepCount(s), 0);
  if (total > MAX_STEPS) {
    const kept = [];
    let used = 0;
    for (const s of out) {
      if (used + stepCount(s) > MAX_STEPS - 1) break;
      kept.push(s);
      used += stepCount(s);
    }
    const tail = blankStep();
    tail.intensity = "ACTIVE";
    if (swim) tail.targetType = null;
    tail.description = "Rest of this session: see rooka";
    kept.push(tail);
    out.length = 0;
    out.push(...kept);
    total = used + 1;
  }

  let order = 0;
  for (const s of out) {
    s.stepOrder = ++order;
    if (s.type === "WorkoutRepeatStep") for (const c of s.steps) c.stepOrder = ++order;
  }
  return out;
}

function parseSteps(workout) {
  if (Array.isArray(workout.steps) && workout.steps.length > 0) return workout.steps;
  if (workout.steps_json) {
    try {
      const parsed = typeof workout.steps_json === "string" ? JSON.parse(workout.steps_json) : workout.steps_json;
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
  }
  return [];
}

/**
 * The Training API body for one rooka workout, or null for a sport Garmin isn't sent.
 * @param {object} workout normalized (see normalizeWorkout)
 * @param {{ hrZones?: Array, powerZones?: Array }} ctx the athlete's zones for this sport
 */
function buildWorkout(workout, ctx = {}) {
  const sport = garminSport(workout.sport);
  if (!sport) return null;
  let steps = parseSteps(workout);
  if (steps.length === 0) {
    // No structure: one open step of about the planned length (as the old push).
    const mins = Math.max(5, Math.round(((Number(workout.target_rooka) || 50) / 55) * 60));
    steps = [{ type: "interval", condition_type: "time", condition_value: mins, target_type: "no.target" }];
  }
  const swim = sport === "LAP_SWIMMING";
  const title = String(workout.title || workout.details || `${workout.sport} workout`).trim();
  const description = String(workout.details || title).trim();
  const pool = swim ? { poolLength: POOL_LENGTH_M, poolLengthUnit: "METER" } : { poolLength: null, poolLengthUnit: null };
  return {
    workoutName: `rooka: ${title.slice(0, 40)}`,
    description: description.slice(0, 1024),
    sport,
    ...pool,
    workoutProvider: PROVIDER,
    workoutSourceId: PROVIDER,
    isSessionTransitionEnabled: false,
    segments: [{ segmentOrder: 1, sport, ...pool, steps: toGarminSteps(steps, sport, ctx) }],
  };
}

// ---------------------------------------------------------------------------
// API client with the Starter rate limits
// ---------------------------------------------------------------------------

const APP_WINDOW_MS = 60 * 1000;
const APP_LIMIT = 90; // of 100 per minute, which also counts token requests
const USER_WINDOW_MS = 24 * 3600 * 1000;
const USER_LIMIT = 190; // of 200 per athlete per day
const appLog = [];
const userLog = new Map(); // userId -> timestamps of calls in the last 24 h
const pausedUntil = new Map(); // userId -> ms, after a 429
let appPausedUntil = 0;

class GarminRateLimitError extends Error {
  constructor(retryAfterMs) {
    super("Garmin rate limit reached");
    this.retryAfterMs = retryAfterMs;
  }
}

/** The app-wide minute budget is spent (as opposed to one athlete's day). */
function appBusy(now = Date.now()) {
  return appPausedUntil > now || appLog.filter((t) => t > now - APP_WINDOW_MS).length >= APP_LIMIT;
}
class GarminPermissionError extends Error {}

/** Takes one call slot for the user and the app, or throws GarminRateLimitError. */
function takeSlot(userId, now = Date.now()) {
  const pause = Math.max(pausedUntil.get(userId) || 0, appPausedUntil);
  if (pause > now) throw new GarminRateLimitError(pause - now);
  while (appLog.length && appLog[0] <= now - APP_WINDOW_MS) appLog.shift();
  if (appLog.length >= APP_LIMIT) throw new GarminRateLimitError(appLog[0] + APP_WINDOW_MS - now);
  const recent = (userLog.get(userId) || []).filter((t) => t > now - USER_WINDOW_MS);
  if (recent.length >= USER_LIMIT) {
    userLog.set(userId, recent);
    throw new GarminRateLimitError(recent[0] + USER_WINDOW_MS - now);
  }
  recent.push(now);
  userLog.set(userId, recent);
  appLog.push(now);
}

async function apiRequest(userId, accessToken, method, pathname, body) {
  takeSlot(userId);
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API_BASE}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 429) {
    const retry = Number(res.headers.get("retry-after"));
    const ms = retry > 0 ? retry * 1000 : 15 * 60 * 1000;
    pausedUntil.set(userId, Date.now() + ms);
    appPausedUntil = Date.now() + APP_WINDOW_MS; // could be the app-wide limit too
    throw new GarminRateLimitError(ms);
  }
  // 412: the athlete took back WORKOUT_IMPORT in Garmin Connect.
  if (res.status === 412) throw new GarminPermissionError("Garmin refused: workout import is not allowed");
  const text = await res.text().catch(() => "");
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {}
  return { status: res.status, ok: res.ok, json, text };
}

const idOf = (v) => (v == null || v === "" ? null : String(v));
const asNumber = (id) => (/^\d+$/.test(String(id)) ? Number(id) : id);

/** The schedule id from a create answer: a bare number, or an object with scheduleId. */
function scheduleIdFromResponse(r) {
  if (r.json != null && typeof r.json !== "object") return idOf(r.json);
  if (r.json && typeof r.json === "object") return idOf(r.json.scheduleId ?? r.json.workoutScheduleId ?? r.json.id);
  return idOf(String(r.text || "").trim().match(/^\d+$/) ? r.text.trim() : null);
}

// ---------------------------------------------------------------------------
// Connection and permission
// ---------------------------------------------------------------------------

function parsePermissions(json) {
  try {
    const list = JSON.parse(json || "null");
    return Array.isArray(list) ? list : null;
  } catch (_) {
    return null;
  }
}

/** The official connection: { garminUserId, permissions } (permissions null when Garmin hasn't said), or null. */
async function connection(userId) {
  const row = await dbGet(`SELECT garmin_user_id, permissions FROM garmin_tokens WHERE user_id = ?`, [userId]).catch(() => null);
  return row ? { garminUserId: String(row.garmin_user_id), permissions: parsePermissions(row.permissions) } : null;
}

/** On the official connection (whatever it may do). */
async function isConnected(userId) {
  return !!(await connection(userId));
}

/** On the official connection with workout import allowed (unknown permissions count until checked). */
async function canReceiveWorkouts(userId) {
  const c = await connection(userId);
  return !!c && (c.permissions === null || c.permissions.includes(WORKOUT_IMPORT));
}

/** Permissions as Garmin says now, stored; only asked when the connect couldn't learn them. */
async function ensurePermissions(userId, accessToken, conn) {
  if (conn.permissions !== null) return conn.permissions;
  const r = await apiRequest(userId, accessToken, "GET", "/partner-gateway/rest/user/permissions");
  if (!r.ok) throw new Error(`Garmin permissions request failed (HTTP ${r.status})`);
  const list = Array.isArray(r.json) ? r.json : r.json && Array.isArray(r.json.permissions) ? r.json.permissions : [];
  await dbRun(`UPDATE garmin_tokens SET permissions = ? WHERE user_id = ?`, [JSON.stringify(list), userId]);
  conn.permissions = list;
  return list;
}

// ---------------------------------------------------------------------------
// Calendar push / mirror
// ---------------------------------------------------------------------------

function amsToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
}

function addDays(ymd, days) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function toYYYYMMDD(d) {
  const s = String(d || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? amsToday() : parsed.toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
}

/** rooka workout in the shape the pusher uses, from a client payload or a micro_plan row. */
function normalizeWorkout(w) {
  return {
    date: toYYYYMMDD(w.date),
    sport: w.sport,
    title: String(w.title || w.description || "").trim(),
    details: String(w.details || (w.title && w.description !== w.title ? w.description : "") || "").trim(),
    target_rooka: w.rookaPoints || w.target_rooka,
    steps: parseSteps(w),
  };
}

/**
 * Keys the sessions: date, Garmin sport and which of that sport on that day
 * (a double run day is two workouts). A brick's bike and run are separate.
 */
function keyWorkouts(workouts) {
  const seen = new Map();
  const out = [];
  for (const w of workouts) {
    const sport = garminSport(w.sport);
    if (!sport) continue;
    const base = `${w.date}:${sport.toLowerCase()}`;
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    out.push({ ...w, key: `${base}:${n}` });
  }
  return out;
}

function sourceHash(date, body) {
  return crypto.createHash("sha1").update(JSON.stringify([date, body])).digest("hex");
}

/** The athlete's zones per sport, read once per sync. */
function zoneCache(userId) {
  const cache = new Map();
  return async (sport) => {
    if (!cache.has(sport)) {
      const label = ZONE_SPORT[sport];
      const [hrZones, zones] = await Promise.all([
        athleteZones.resolveWatchHrZones(userId, label).catch(() => null),
        sport === "CYCLING" ? athleteZones.resolveZonesForUser(userId, label).catch(() => null) : null,
      ]);
      cache.set(sport, { hrZones, powerZones: zones ? zones.powerZones : null });
    }
    return cache.get(sport);
  };
}

async function saveRow(userId, conn, w, ids, hash) {
  await dbRun(
    `INSERT INTO garmin_workouts (user_id, workout_key, garmin_user_id, workout_id, owner_id, schedule_id, calendar_date, source_hash, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id, workout_key) DO UPDATE SET
       garmin_user_id = excluded.garmin_user_id, workout_id = excluded.workout_id, owner_id = excluded.owner_id,
       schedule_id = excluded.schedule_id, calendar_date = excluded.calendar_date,
       source_hash = excluded.source_hash, updated_at = CURRENT_TIMESTAMP`,
    [userId, w.key, conn.garminUserId, ids.workoutId, ids.ownerId, ids.scheduleId, w.date, hash],
  );
}

/**
 * Creates or updates the Garmin workout for one keyed session and makes sure it
 * is scheduled on its date. `known` is its garmin_workouts row, if any.
 */
async function upsertWorkout(userId, accessToken, conn, w, body, known, { force = false } = {}) {
  const hash = sourceHash(w.date, body);
  if (known && known.schedule_id && known.source_hash === hash && !force) return { changed: false };

  let workoutId = known ? idOf(known.workout_id) : null;
  let ownerId = known ? idOf(known.owner_id) : null;
  let scheduleId = known ? idOf(known.schedule_id) : null;

  if (workoutId) {
    const path = `/training-api/workout/v2/${encodeURIComponent(workoutId)}`;
    if (!ownerId) {
      const r = await apiRequest(userId, accessToken, "GET", path);
      if (r.ok && r.json) ownerId = idOf(r.json.ownerId);
    }
    const put = await apiRequest(userId, accessToken, "PUT", path, { ...body, workoutId: asNumber(workoutId), ownerId: ownerId ? asNumber(ownerId) : null });
    let gone = put.status === 404 || put.status === 410;
    if (put.status === 403) {
      // Not allowed: gone in Garmin Connect, or ours but refused. Only a workout we can't read is made again.
      const r = await apiRequest(userId, accessToken, "GET", path);
      gone = r.status === 403 || r.status === 404 || r.status === 410;
      if (!gone) throw new Error(`Garmin refused the workout update (HTTP 403) ${put.text.slice(0, 500)}`);
    }
    if (gone) {
      workoutId = null; // deleted in Garmin Connect: create it again
      scheduleId = null;
    } else if (!put.ok) {
      throw new Error(`Garmin rejected the workout update (HTTP ${put.status}) ${put.text.slice(0, 500)}`);
    }
  }

  if (!workoutId) {
    const post = await apiRequest(userId, accessToken, "POST", "/workoutportal/workout/v2", body);
    if (!post.ok) throw new Error(`Garmin rejected the workout (HTTP ${post.status}) ${post.text.slice(0, 500)}`);
    workoutId = idOf(post.json && post.json.workoutId);
    ownerId = idOf(post.json && post.json.ownerId);
    if (!workoutId) throw new Error("Garmin created the workout but returned no id");
    scheduleId = null;
  }

  if (!scheduleId) {
    const s = await apiRequest(userId, accessToken, "POST", "/training-api/schedule/", { workoutId: asNumber(workoutId), date: w.date });
    if (!s.ok) {
      // Keep the workout id (no hash), so the next sync schedules it instead of making another.
      await saveRow(userId, conn, w, { workoutId, ownerId, scheduleId: null }, null);
      throw new Error(`Garmin rejected the schedule (HTTP ${s.status}) ${s.text.slice(0, 500)}`);
    }
    scheduleId = scheduleIdFromResponse(s);
  }

  await saveRow(userId, conn, w, { workoutId, ownerId, scheduleId }, scheduleId ? hash : null);
  return { changed: true, workoutId, scheduleId };
}

/** Takes a session off the Garmin calendar: its schedule, then the workout. */
async function deleteWorkout(userId, accessToken, row) {
  if (row.schedule_id) {
    const s = await apiRequest(userId, accessToken, "DELETE", `/training-api/schedule/${encodeURIComponent(row.schedule_id)}`);
    if (!s.ok && s.status !== 404) throw new Error(`Garmin rejected the schedule delete (HTTP ${s.status})`);
  }
  const r = await apiRequest(userId, accessToken, "DELETE", `/training-api/workout/v2/${encodeURIComponent(row.workout_id)}`);
  if (!r.ok && r.status !== 404) throw new Error(`Garmin rejected the workout delete (HTTP ${r.status})`);
  await dbRun(`DELETE FROM garmin_workouts WHERE user_id = ? AND workout_key = ?`, [userId, row.workout_key]);
}

/** After a 412: what the athlete allows is unknown again; the next send asks Garmin (one call). */
async function permissionRefused(userId) {
  await dbRun(`UPDATE garmin_tokens SET permissions = NULL WHERE user_id = ?`, [userId]).catch(() => {});
  return noPermissionResult();
}

const NO_PERMISSION_MESSAGE = "Allow rooka to send workouts to Garmin: connect Garmin again and tick workout import.";
const noPermissionResult = () => ({ status: 403, body: { error: NO_PERMISSION_MESSAGE, code: "GARMIN_NO_WORKOUT_IMPORT" } });
const notConnectedResult = () => ({ status: 400, body: { error: "Garmin is not connected." } });

function rateLimitResult(e, syncedCount) {
  const minutes = Math.max(1, Math.ceil(e.retryAfterMs / 60000));
  // 503, not 429: the app treats a 429 as rooka's own rate limit.
  return {
    status: syncedCount > 0 ? 200 : 503,
    body: {
      success: syncedCount > 0,
      syncedCount,
      error: syncedCount > 0 ? undefined : `Garmin is busy. Please try again in ${minutes} minutes.`,
      message: syncedCount > 0 ? `Sent ${syncedCount}; the rest follows automatically in ${minutes} minutes.` : undefined,
    },
  };
}

const sentResult = (syncedCount, extra = {}) => ({
  status: 200,
  body: {
    success: true,
    message: `Successfully pushed ${syncedCount} structured workout${syncedCount === 1 ? "" : "s"} to Garmin!`,
    syncedCount,
    ...extra,
  },
});

/** Token, connection and permission for a send; a result to return instead when there is none. */
async function prepare(userId) {
  const conn = await connection(userId);
  if (!conn) return { stop: notConnectedResult() };
  if (conn.permissions !== null && !conn.permissions.includes(WORKOUT_IMPORT)) return { stop: noPermissionResult() };
  const accessToken = await garmin.getValidAccessToken(userId);
  if (!accessToken) return { stop: notConnectedResult() };
  const perms = await ensurePermissions(userId, accessToken, conn);
  if (!perms.includes(WORKOUT_IMPORT)) return { stop: noPermissionResult() };
  return { conn, accessToken };
}

/** Rows made for another Garmin account than the one connected now aren't ours to touch. */
async function trackedRows(userId, conn) {
  const rows = await dbAll(`SELECT * FROM garmin_workouts WHERE user_id = ?`, [userId]);
  const mine = [];
  for (const r of rows) {
    if (r.garmin_user_id && conn && String(r.garmin_user_id) !== conn.garminUserId) {
      await dbRun(`DELETE FROM garmin_workouts WHERE user_id = ? AND workout_key = ?`, [userId, r.workout_key]);
    } else mine.push(r);
  }
  return mine;
}

/**
 * Pushes workouts to the athlete's Garmin calendar through the Training API.
 * Sending a session again updates the same Garmin workout. Shared by
 * POST /api/sync-garmin and POST /api/devices/send-workouts for athletes on the
 * official connection.
 *
 * @param {number} userId
 * @param {Array|null} selectedWorkouts explicit workouts from the client, or null
 *   to mirror the upcoming plan (create, update, delete).
 * @returns {Promise<{ status: number, body: object }>}
 */
async function pushWorkouts(userId, selectedWorkouts) {
  try {
    if (!Array.isArray(selectedWorkouts) || selectedWorkouts.length === 0) return await syncGarminCalendar(userId);
    // Without steps or a title the client means "these plan sessions" (date + sport).
    let source = selectedWorkouts;
    if (!selectedWorkouts.some((sw) => sw && (sw.steps || sw.title))) {
      const rows = await dbAll(
        `SELECT id, date, sport, description, details, target_rooka, steps_json FROM micro_plan WHERE user_id = ? AND date >= ? ORDER BY date, id`,
        [userId, amsToday()],
      );
      source = rows
        .filter((r) => selectedWorkouts.some((sw) => sw && sw.date === r.date && sw.sport === r.sport))
        .map((r) => ({ ...r, title: r.description }));
    }
    const workouts = keyWorkouts(source.filter(Boolean).map(normalizeWorkout));
    if (workouts.length === 0) {
      // Nothing Garmin takes (rest, or a sport it has no workout for).
      return { status: 200, body: { success: true, skipped: true, syncedCount: 0 } };
    }

    const p = await prepare(userId);
    if (p.stop) return p.stop;
    const tracked = new Map((await trackedRows(userId, p.conn)).map((r) => [r.workout_key, r]));
    const zonesFor = zoneCache(userId);
    let syncedCount = 0;
    let lastError = null;
    for (const w of workouts) {
      try {
        const body = buildWorkout(w, await zonesFor(garminSport(w.sport)));
        await upsertWorkout(userId, p.accessToken, p.conn, w, body, tracked.get(w.key), { force: true });
        syncedCount++;
      } catch (e) {
        if (e instanceof GarminRateLimitError) return rateLimitResult(e, syncedCount);
        if (e instanceof GarminPermissionError) return permissionRefused(userId);
        lastError = e.message;
        console.error(`[Garmin Training] push failed for ${w.key}:`, e.message);
      }
    }
    if (syncedCount === 0) {
      return { status: 502, body: { error: "Failed to schedule workouts on Garmin calendar.", details: lastError } };
    }
    return sentResult(syncedCount);
  } catch (err) {
    if (err instanceof GarminRateLimitError) return rateLimitResult(err, 0);
    if (err instanceof GarminPermissionError) return permissionRefused(userId);
    console.error("[Garmin Training] push error:", err.message);
    return { status: 500, body: { error: "Garmin workout push failed.", details: err.message } };
  }
}

/**
 * Mirrors the plan onto the Garmin calendar: every planned session in the next
 * MIRROR_DAYS is created or updated (only when its workout changed), and
 * workouts rooka made for upcoming sessions that are no longer planned are
 * deleted. Past ones are left alone. Makes no calls when nothing changed.
 */
async function syncGarminCalendar(userId) {
  const conn = await connection(userId);
  if (!conn) return notConnectedResult();
  if (conn.permissions !== null && !conn.permissions.includes(WORKOUT_IMPORT)) return noPermissionResult();

  const today = amsToday();
  const horizon = addDays(today, MIRROR_DAYS - 1);
  const rows = await dbAll(
    `SELECT id, date, sport, description, details, target_rooka, steps_json FROM micro_plan
     WHERE user_id = ? AND date >= ? ORDER BY date, id`,
    [userId, today],
  );
  const planned = new Map(keyWorkouts(rows.map((r) => normalizeWorkout({ ...r, title: r.description }))).map((w) => [w.key, w]));

  const tracked = [];
  for (const r of await trackedRows(userId, conn)) {
    // Done or skipped: it stays in Garmin Connect, rooka stops tracking it.
    if (r.calendar_date < today) await dbRun(`DELETE FROM garmin_workouts WHERE user_id = ? AND workout_key = ?`, [userId, r.workout_key]);
    else tracked.push(r);
  }
  const trackedByKey = new Map(tracked.map((r) => [r.workout_key, r]));

  // Work out what changed before asking for a token, so a quiet sync costs nothing.
  const zonesFor = zoneCache(userId);
  const toDelete = tracked.filter((r) => !planned.has(r.workout_key));
  const toUpsert = [];
  for (const [key, w] of planned) {
    const known = trackedByKey.get(key);
    // Beyond the window only sessions already on the calendar are kept up to date.
    if (w.date > horizon && !known) continue;
    const body = buildWorkout(w, await zonesFor(garminSport(w.sport)));
    if (known && known.schedule_id && known.source_hash === sourceHash(w.date, body)) continue;
    toUpsert.push({ w, body, known });
  }
  if (toDelete.length === 0 && toUpsert.length === 0) return sentResult(0, { deletedCount: 0 });

  let syncedCount = 0;
  let deletedCount = 0;
  let lastError = null;
  try {
    const p = await prepare(userId);
    if (p.stop) return p.stop;
    for (const row of toDelete) {
      try {
        await deleteWorkout(userId, p.accessToken, row);
        deletedCount++;
      } catch (e) {
        if (e instanceof GarminRateLimitError || e instanceof GarminPermissionError) throw e;
        lastError = e.message;
      }
    }
    for (const { w, body, known } of toUpsert) {
      try {
        await upsertWorkout(userId, p.accessToken, p.conn, w, body, known);
        syncedCount++;
      } catch (e) {
        if (e instanceof GarminRateLimitError || e instanceof GarminPermissionError) throw e;
        lastError = e.message;
        console.error(`[Garmin Training] sync failed for ${w.key}:`, e.message);
      }
    }
  } catch (e) {
    if (e instanceof GarminRateLimitError) return rateLimitResult(e, syncedCount);
    if (e instanceof GarminPermissionError) return permissionRefused(userId);
    throw e;
  }

  if (lastError && syncedCount === 0 && deletedCount === 0) {
    return { status: 502, body: { error: "Failed to schedule workouts on Garmin calendar.", details: lastError } };
  }
  return sentResult(syncedCount, { deletedCount });
}

let mirrorRunning = false;
/** Cron: keep every official connection's Garmin calendar in step with the plan. */
async function syncAllGarminUsers() {
  if (!garmin.isConfigured() || mirrorRunning) return;
  mirrorRunning = true;
  try {
    const users = await dbAll(`SELECT user_id FROM garmin_tokens`);
    for (const { user_id: userId } of users) {
      if (!(await canReceiveWorkouts(userId))) continue;
      try {
        const r = await syncGarminCalendar(userId);
        if (r.status === 503 && appBusy()) break; // the app is out of calls; the next run continues
        if (r.status >= 400 && r.status !== 403) console.warn(`[Garmin Training] sync for user ${userId}: ${r.body.error}${r.body.details ? ` (${r.body.details})` : ""}`);
      } catch (e) {
        console.error(`[Garmin Training] sync for user ${userId} failed:`, e.message);
      }
    }
  } finally {
    mirrorRunning = false;
  }
}

module.exports = {
  WORKOUT_IMPORT,
  MAX_STEPS,
  garminSport,
  strengthExercise,
  NOT_IN_TRAINING_API,
  toGarminSteps,
  buildWorkout,
  isConnected,
  canReceiveWorkouts,
  pushWorkouts,
  syncGarminCalendar,
  syncAllGarminUsers,
  // for tests
  _userLog: userLog,
  _appLog: appLog,
  _pausedUntil: pausedUntil,
  _resetAppPause: () => {
    appPausedUntil = 0;
  },
  GarminRateLimitError,
};
