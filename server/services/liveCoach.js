/**
 * Live workout coaching rules.
 *
 * Pure: no database, no network. The worker (services/liveSessionWorker.js) feeds
 * Garmin LiveTrack track points into processPoint() one by one, in time order, and
 * pushes whatever cues come back. That keeps every rule testable with synthetic
 * points (test_liveCoach.js).
 *
 * A planned workout (micro_plan.steps_json) is flattened into a timeline. The
 * athlete's position in it follows the activity timer and distance, the same way
 * the watch advances a structured workout. Steps that end on a lap press can't be
 * followed, so plan cues stop there and only the session-wide cues remain.
 */

// Approved with the athlete on 2026-10-20. Show the effect before changing any of these.
const RULES = {
  paceBand: 0.05, // ±5% around the target speed, the band rooka sends to the watch
  powerBand: 0.1, // ±10% around an exact power target, also what the watch gets
  hrMarginBpm: 3, // HR zone bounds widened for sensor noise
  smoothPoints: 3, // average of the last 3 moving points (~30 s)
  graceSec: 30, // ignore the start of a step for pace and power
  hrGraceSec: 60, // HR lags the effort
  offTargetSec: 60, // out of band this long before warning
  spotOnMinSec: 120, // a step must last 2 min to earn praise
  spotOnShare: 0.8, // share of points in band for "spot on"
  lastRepMinIterations: 3, // only call out the last rep of a set of 3+
  driftMinStepSec: 20 * 60, // HR drift is checked on steady stretches of 20 min+
  driftBaselineSec: 10 * 60, // compared with the first 10 min of that stretch
  driftRise: 0.08, // HR 8% above that baseline...
  driftSpeedBand: 0.05, // ...while the speed is within 5% of it ("same pace")
  minGapSec: 3 * 60, // between any two cues
  windowSec: 20 * 60, // rolling window for the cue budget
  maxPerWindow: 3, // cues per rolling window (the last-rep cue breaks both limits)
  checkInSilenceSec: 20 * 60, // a status check-in after this long without a cue
};

const WORK_TYPES = new Set(["interval", "active", "other"]);

// ---------------------------------------------------------------------------
// Plan → timeline
// ---------------------------------------------------------------------------

function conditionOf(step) {
  const v = Number(step.condition_value) || 0;
  if (v <= 0) return { kind: "open" };
  switch (step.condition_type) {
    case "time_sec":
      return { kind: "time", value: v };
    case "time":
      // Minutes, unless it is clearly seconds (same rule as workoutPlanning's duration estimate).
      return { kind: "time", value: v > 180 && v % 30 === 0 ? v : v * 60 };
    case "distance":
      return { kind: "distance", value: v };
    case "distance_km":
      return { kind: "distance", value: v * 1000 };
    default:
      return { kind: "open" }; // reps, lap button
  }
}

function parsePaceSecPerKm(value) {
  const m = String(value || "").match(/(\d+)[:.](\d{1,2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function zoneBand(table, zone) {
  if (!Array.isArray(table) || zone == null) return null;
  const z = table.find((b) => Number(b.zone) === Number(zone));
  if (!z || !(Number(z.min) > 0)) return null;
  return { min: Number(z.min), max: z.max == null ? null : Number(z.max) };
}

function targetOf(step, { hrZones = null, powerZones = null } = {}) {
  const tt = step.target_type;
  if (tt === "pace.exact" || tt === "pace.zone") {
    const sec = parsePaceSecPerKm(step.target_value);
    if (!sec) return null;
    const speed = 1000 / sec;
    return {
      metric: "speed",
      lo: speed * (1 - RULES.paceBand),
      hi: speed * (1 + RULES.paceBand),
      label: { kind: "pace", secPerKm: sec },
    };
  }
  if (tt === "power.exact" || (tt === "power.zone" && step.target_value)) {
    const w = Number((String(step.target_value).match(/\d+/) || [])[0]);
    if (!w) return null;
    return { metric: "power", lo: w * (1 - RULES.powerBand), hi: w * (1 + RULES.powerBand), label: { kind: "power", watts: w } };
  }
  if (tt === "power.zone") {
    const band = zoneBand(powerZones, step.zone);
    if (!band) return null;
    return {
      metric: "power",
      lo: band.min,
      hi: band.max == null ? Infinity : band.max,
      label: { kind: "powerRange", min: band.min, max: band.max },
    };
  }
  if (tt === "heart.rate.zone") {
    const band = zoneBand(hrZones, step.zone);
    if (!band) return null;
    return {
      metric: "hr",
      lo: band.min - RULES.hrMarginBpm,
      hi: band.max == null ? Infinity : band.max + RULES.hrMarginBpm,
      label: { kind: "hrRange", min: band.min, max: band.max },
    };
  }
  return null;
}

/** Flatten planned steps (with nested repeats) into one step per segment, in order. */
function buildTimeline(steps, zoneTables = {}) {
  const out = [];
  const walk = (list, rep) => {
    for (const s of Array.isArray(list) ? list : []) {
      if (!s) continue;
      if (s.type === "repeat" && Array.isArray(s.steps)) {
        const n = Math.max(1, parseInt(s.iterations, 10) || 1);
        for (let i = 1; i <= n; i++) walk(s.steps, { i, n });
      } else {
        out.push({
          type: s.type || "interval",
          name: s.exerciseName || null,
          cond: conditionOf(s),
          target: targetOf(s, zoneTables),
          rep,
        });
      }
    }
  };
  walk(steps, null);
  return out;
}

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

function freshSegment(t, d) {
  return {
    startT: t,
    startD: d,
    samples: 0,
    inBand: 0,
    offSince: null,
    offDir: null,
    warned: { above: false, below: false },
    base: { hr: 0, speed: 0, n: 0 },
    driftSent: false,
  };
}

/**
 * @param {object} opts
 * @param {Array}  opts.timeline     from buildTimeline(), [] when nothing is planned
 * @param {string} [opts.workoutName]
 * @param {string} [opts.sport]      rooka sport ("Run", "Bike", ...)
 */
function createSession({ timeline = [], workoutName = null, sport = null } = {}) {
  return {
    timeline,
    workoutName,
    sport,
    stepIdx: 0,
    planLost: false, // reached a step that ends on a lap press
    seg: freshSegment(0, 0),
    recent: [],
    lastT: 0,
    lastD: 0,
    hr: { sum: 0, n: 0 },
    started: false,
    sent: [], // { atMs, type }
  };
}

function currentStep(state) {
  if (state.planLost) return null;
  return state.timeline[state.stepIdx] || null;
}

function isWork(step) {
  return !!step && WORK_TYPES.has(step.type);
}

// ---------------------------------------------------------------------------
// Cue budget
// ---------------------------------------------------------------------------

function allowed(state, atMs, { priority = false } = {}) {
  // The last rep is announced whatever was said before it (approved 2026-10-20).
  if (priority) return true;
  const last = state.sent[state.sent.length - 1];
  if (last && atMs - last.atMs < RULES.minGapSec * 1000) return false;
  const inWindow = state.sent.filter((s) => atMs - s.atMs < RULES.windowSec * 1000).length;
  return inWindow < RULES.maxPerWindow;
}

/** Record and return the cue when the budget allows it, else null. */
function offer(state, cues, atMs, cue, opts) {
  if (state.silent || !allowed(state, atMs, opts)) return null;
  state.sent.push({ atMs, type: cue.type });
  const out = { ...cue, atMs };
  cues.push(out);
  return out;
}

// ---------------------------------------------------------------------------
// Point processing
// ---------------------------------------------------------------------------

function avg(list, key) {
  const vals = list.map((p) => p[key]).filter((v) => Number.isFinite(v) && v > 0);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function stepLabel(step) {
  if (!step) return null;
  if (step.rep && isWork(step)) return { kind: "rep", i: step.rep.i, n: step.rep.n };
  return { kind: "name", name: step.name, type: step.type };
}

function finishStep(state, endT, atMs, cues) {
  const step = currentStep(state);
  const seg = state.seg;
  if (
    isWork(step) &&
    step.target &&
    endT - seg.startT >= RULES.spotOnMinSec &&
    seg.samples >= 3 &&
    seg.inBand / seg.samples >= RULES.spotOnShare
  ) {
    offer(state, cues, atMs, {
      type: "spotOn",
      step: stepLabel(step),
      pct: Math.round((seg.inBand / seg.samples) * 100),
    });
  }
}

function enterStep(state, idx, t, d, atMs, cues) {
  const prev = state.timeline[idx - 1];
  state.stepIdx = idx;
  state.seg = freshSegment(t, d);
  const step = state.timeline[idx];
  if (!step) return;
  if (step.cond.kind === "open") {
    state.planLost = true;
    return;
  }
  const firstOfIteration = step.rep && (!prev || !prev.rep || prev.rep.i !== step.rep.i);
  if (firstOfIteration && step.rep.i === step.rep.n && step.rep.n >= RULES.lastRepMinIterations) {
    offer(state, cues, atMs, { type: "lastRep" }, { priority: true });
  }
}

/** Move through every planned step the athlete has completed by (t, d). */
function advance(state, t, d, atMs, cues) {
  for (let guard = 0; guard < 1000; guard++) {
    const step = currentStep(state);
    if (!step) return;
    if (step.cond.kind === "open") {
      state.planLost = true;
      return;
    }
    const seg = state.seg;
    let endT = null;
    let endD = null;
    if (step.cond.kind === "time" && t - seg.startT >= step.cond.value) {
      endT = seg.startT + step.cond.value;
      // Distance at that moment is unknown between points; the current one is close enough.
      endD = d;
    } else if (step.cond.kind === "distance" && d - seg.startD >= step.cond.value) {
      endT = t;
      endD = seg.startD + step.cond.value;
    }
    if (endT == null) return;
    finishStep(state, endT, atMs, cues);
    enterStep(state, state.stepIdx + 1, endT, endD, atMs, cues);
  }
}

function evaluateTarget(state, t, atMs, cues) {
  const step = currentStep(state);
  const seg = state.seg;
  if (!step || !step.target) return null;
  const { metric, lo, hi } = step.target;
  const grace = metric === "hr" ? RULES.hrGraceSec : RULES.graceSec;
  if (t - seg.startT < grace) return null;
  const value = avg(state.recent, metric);
  if (value == null) return null;

  const dir = value > hi ? "above" : value < lo ? "below" : null;
  seg.samples++;
  if (!dir) {
    seg.inBand++;
    seg.offSince = null;
    seg.offDir = null;
    return "in";
  }
  if (seg.offDir !== dir) {
    seg.offDir = dir;
    seg.offSince = t;
  }
  // One warning per direction per step: a second "ease off" in the same rep is nagging.
  if (t - seg.offSince >= RULES.offTargetSec && !seg.warned[dir]) {
    const sent = offer(state, cues, atMs, {
      type: dir,
      step: stepLabel(step),
      actual: { metric, value },
      target: step.target.label,
    });
    if (sent) seg.warned[dir] = true;
  }
  return dir;
}

function checkDrift(state, t, atMs, cues) {
  const seg = state.seg;
  const step = currentStep(state);
  if (step && step.type === "rest") return;
  const into = t - seg.startT;
  const last = state.recent[state.recent.length - 1];
  if (!last) return;

  if (into >= RULES.hrGraceSec && into <= RULES.driftBaselineSec && last.hr > 0 && last.speed > 0) {
    seg.base.hr += last.hr;
    seg.base.speed += last.speed;
    seg.base.n++;
    return;
  }
  if (seg.driftSent || into < RULES.driftMinStepSec || seg.base.n < 3) return;
  const baseHr = seg.base.hr / seg.base.n;
  const baseSpeed = seg.base.speed / seg.base.n;
  const hr = avg(state.recent, "hr");
  const speed = avg(state.recent, "speed");
  if (!hr || !speed) return;
  if (Math.abs(speed - baseSpeed) / baseSpeed > RULES.driftSpeedBand) return;
  if (hr < baseHr * (1 + RULES.driftRise)) return;
  if (offer(state, cues, atMs, { type: "hrDrift", pct: Math.round((hr / baseHr - 1) * 100) })) {
    seg.driftSent = true;
  }
}

function checkIn(state, t, d, atMs, status, cues) {
  if (status === "above" || status === "below") return;
  const last = state.sent[state.sent.length - 1];
  if (last && atMs - last.atMs < RULES.checkInSilenceSec * 1000) return;
  offer(state, cues, atMs, {
    type: "checkIn",
    elapsedMin: Math.round(t / 60),
    avgSpeed: t > 0 && d > 0 ? d / t : null,
    hr: avg(state.recent, "hr"),
  });
}

/**
 * Feed one LiveTrack track point (in time order). Returns the cues to send now.
 * Each cue is { type, atMs, ...params }; renderCue() turns it into text.
 */
function processPoint(state, point) {
  const cues = [];
  const atMs = Date.parse(point.dateTime);
  const t = Number(point.durationSecs ?? point.totalDurationSecs) || state.lastT;
  const d = Number(point.distanceMeters ?? point.totalDistanceMeters) || state.lastD;
  state.lastT = Math.max(state.lastT, t);
  state.lastD = Math.max(state.lastD, d);

  if (!state.started) {
    state.started = true;
    offer(state, cues, atMs, { type: "start", workoutName: state.workoutName, sport: state.sport });
    // The plan runs from the start of the activity, not from the first point: without
    // GPS the first point can arrive many minutes in. Catch up silently.
    state.silent = true;
    if (state.timeline.length) enterStep(state, 0, 0, 0, atMs, []);
    else state.seg = freshSegment(t, d);
    advance(state, t, d, atMs, []);
    state.silent = false;
  }

  advance(state, t, d, atMs, cues);

  const hr = Number(point.heartRateBeatsPerMin) || 0;
  if (hr > 0) {
    state.hr.sum += hr;
    state.hr.n++;
  }
  if (point.pointStatus === "STATIONARY") {
    // Standing at a traffic light is neither on nor off target.
    state.recent = [];
    state.seg.offSince = null;
    state.seg.offDir = null;
    return cues;
  }
  state.recent.push({
    t,
    speed: Number(point.speedMetersPerSec ?? point.speed) || 0,
    hr,
    power: Number(point.powerWatts) || 0,
  });
  if (state.recent.length > RULES.smoothPoints) state.recent.shift();

  const status = evaluateTarget(state, t, atMs, cues);
  checkDrift(state, t, atMs, cues);
  checkIn(state, t, d, atMs, status, cues);
  return cues;
}

/** Short numbers for the end-of-session record. */
function summarize(state) {
  return {
    durationMin: Math.round(state.lastT / 60),
    distanceKm: Math.round(state.lastD / 100) / 10,
    avgHr: state.hr.n ? Math.round(state.hr.sum / state.hr.n) : null,
    stepsPlanned: state.timeline.length,
    stepsReached: state.planLost ? state.stepIdx + 1 : Math.min(state.stepIdx, state.timeline.length),
    planLost: state.planLost,
    cues: state.sent.map((s) => s.type),
  };
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

function fmtPace(secPerKm) {
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}/km`;
}

function fmtTarget(label) {
  if (!label) return "";
  switch (label.kind) {
    case "pace":
      return fmtPace(label.secPerKm);
    case "power":
      return `${label.watts} W`;
    case "powerRange":
      return label.max == null ? `${label.min}+ W` : `${label.min}–${label.max} W`;
    case "hrRange":
      return label.max == null ? `♥ ${label.min}+` : `♥ ${label.min}–${label.max}`;
    default:
      return "";
  }
}

function fmtActual({ metric, value }) {
  if (metric === "speed") return fmtPace(1000 / value);
  if (metric === "power") return `${Math.round(value)} W`;
  return `♥ ${Math.round(value)}`;
}

function fmtSpeed(speed, sport) {
  if (!speed) return null;
  return sport === "Bike" ? `${(speed * 3.6).toFixed(1)} km/h` : fmtPace(1000 / speed);
}

function truncate(s, n) {
  if (!s) return s;
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

/** Push title and body for a cue in the athlete's language. */
function renderCue(lang, cue, { sport = null } = {}) {
  const { t, sportNoun } = require("./i18n");
  const k = (key, params) => t(lang, `push.live.${key}`, params);
  const step = (label) => {
    if (!label) return "";
    if (label.kind === "rep") return k("rep", { i: label.i, n: label.n });
    return truncate(label.name, 24) || t(lang, "common.workout");
  };
  let body;
  switch (cue.type) {
    case "start":
      body = cue.workoutName
        ? k("start", { workout: truncate(cue.workoutName, 32) })
        : k("startNoPlan", { sport: sportNoun(lang, cue.sport || sport || "Run") });
      break;
    case "above":
    case "below":
      body = k(cue.type, { step: step(cue.step), actual: fmtActual(cue.actual), target: fmtTarget(cue.target) });
      break;
    case "spotOn":
      body = k("spotOn", { step: step(cue.step), pct: cue.pct });
      break;
    case "lastRep":
      body = k("lastRep");
      break;
    case "hrDrift":
      body = k("hrDrift", { pct: cue.pct });
      break;
    case "checkIn": {
      const parts = [k("elapsed", { min: cue.elapsedMin })];
      const spd = fmtSpeed(cue.avgSpeed, sport);
      if (spd) parts.push(spd);
      if (cue.hr) parts.push(`♥ ${Math.round(cue.hr)}`);
      body = k("checkIn", { status: parts.join(" · ") });
      break;
    }
    default:
      body = "";
  }
  return { title: k("title"), body };
}

module.exports = {
  RULES,
  buildTimeline,
  createSession,
  processPoint,
  summarize,
  renderCue,
  // exposed for tests
  conditionOf,
  targetOf,
  fmtPace,
};
