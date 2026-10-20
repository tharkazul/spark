// Live coaching rules (services/liveCoach.js), driven by synthetic LiveTrack points.
// Uses a throwaway database because rendering pulls in i18n, which opens the db.
const path = require("path");
const os = require("os");
process.env.DB_PATH = path.join(os.tmpdir(), `rooka_livecoach_test_${process.pid}.db`);

const assert = require("assert");
const { RULES, buildTimeline, createSession, processPoint, summarize, renderCue, conditionOf, targetOf } = require("./services/liveCoach");

console.log("🏁 Running live coach unit tests...\n");

const T0 = Date.parse("2026-10-20T08:00:00Z");

/**
 * Points every 10 s for a list of segments: { sec, speed, hr, stationary }.
 * startT lets a session begin mid-activity (late GPS fix).
 */
function makePoints(segments, { startT = 0, every = 10 } = {}) {
  const pts = [];
  let t = startT;
  let d = 0;
  for (const seg of segments) {
    for (let s = 0; s < seg.sec; s += every) {
      t += every;
      const speed = seg.stationary ? 0 : seg.speed;
      d += speed * every;
      const hr = typeof seg.hr === "function" ? seg.hr(s, seg.sec) : seg.hr;
      pts.push({
        dateTime: new Date(T0 + t * 1000).toISOString(),
        durationSecs: t,
        distanceMeters: d,
        speedMetersPerSec: speed,
        heartRateBeatsPerMin: hr,
        pointStatus: seg.stationary ? "STATIONARY" : "MOVING",
      });
    }
  }
  return pts;
}

function run(state, points) {
  const cues = [];
  for (const p of points) cues.push(...processPoint(state, p));
  return cues;
}

function assertBudget(cues) {
  for (let i = 1; i < cues.length; i++) {
    const gap = (cues[i].atMs - cues[i - 1].atMs) / 1000;
    if (cues[i].type !== "lastRep") assert.ok(gap >= RULES.minGapSec, `${cues[i].type} came ${gap}s after ${cues[i - 1].type}`);
  }
  for (const c of cues) {
    if (c.type === "lastRep") continue; // announced regardless of the budget
    const inWindow = cues.filter((o) => o.atMs <= c.atMs && c.atMs - o.atMs < RULES.windowSec * 1000).length;
    assert.ok(inWindow <= RULES.maxPerWindow, `more than ${RULES.maxPerWindow} cues in 20 min at ${c.type}`);
  }
}

// 1. Step durations and targets read the same way the planner and the watch do.
{
  assert.deepStrictEqual(conditionOf({ condition_type: "time", condition_value: 10 }), { kind: "time", value: 600 });
  assert.deepStrictEqual(conditionOf({ condition_type: "time", condition_value: 300 }), { kind: "time", value: 300 });
  assert.deepStrictEqual(conditionOf({ condition_type: "time_sec", condition_value: 90 }), { kind: "time", value: 90 });
  assert.deepStrictEqual(conditionOf({ condition_type: "distance", condition_value: 1000 }), { kind: "distance", value: 1000 });
  assert.deepStrictEqual(conditionOf({ condition_type: "reps", condition_value: 10 }), { kind: "open" });

  const pace = targetOf({ target_type: "pace.exact", target_value: "4:10" });
  assert.strictEqual(pace.metric, "speed");
  assert.ok(Math.abs(pace.lo - 4 * 0.95) < 1e-9 && Math.abs(pace.hi - 4 * 1.05) < 1e-9, "±5% around 4.0 m/s");
  const power = targetOf({ target_type: "power.exact", target_value: "190" });
  assert.deepStrictEqual([power.lo, power.hi].map(Math.round), [171, 209]);
  const hr = targetOf({ target_type: "heart.rate.zone", zone: 2 }, { hrZones: [{ zone: 2, min: 128, max: 141 }] });
  assert.deepStrictEqual([hr.lo, hr.hi], [125, 144]);
  assert.strictEqual(targetOf({ target_type: "heart.rate.zone", zone: 2 }), null, "no zone table, no target");
  console.log("✅ Step durations and target bands");
}

// 2. Interval session: a fast rep is called out, good reps are praised, the last rep is announced.
const INTERVALS = [
  { type: "warmup", exerciseName: "Easy jog", condition_type: "time", condition_value: 10, target_type: "no.target" },
  {
    type: "repeat",
    iterations: 5,
    steps: [
      { type: "interval", exerciseName: "1000m Threshold", condition_type: "distance", condition_value: 1000, target_type: "pace.exact", target_value: "4:10" },
      { type: "rest", condition_type: "time_sec", condition_value: 90, target_type: "no.target" },
    ],
  },
  { type: "cooldown", exerciseName: "Easy jog", condition_type: "time", condition_value: 10, target_type: "no.target" },
];
{
  const timeline = buildTimeline(INTERVALS);
  assert.strictEqual(timeline.length, 12, "warmup + 5×(rep, rest) + cooldown");
  const state = createSession({ timeline, workoutName: "5×1000m threshold", sport: "Run" });
  const rep = (speed) => ({ sec: 1000 / speed, speed, hr: 165 });
  const rest = { sec: 90, speed: 2, hr: 140 };
  const points = makePoints([
    { sec: 600, speed: 2.8, hr: 135 },
    rep(4.0), rest, // rep 1 on pace (4:10/km)
    rep(4.0), rest, // rep 2 on pace
    rep(4.6), rest, // rep 3 at 3:37/km: too fast
    rep(4.0), rest,
    rep(4.0), rest, // rep 5
    { sec: 600, speed: 2.8, hr: 135 },
  ]);
  const cues = run(state, points);
  const types = cues.map((c) => c.type);

  const at = (c) => `${c.type}@${Math.round((c.atMs - T0) / 1000)}`;
  // Rep 1 ends at 850 s, rep 2 at 1190 s. Rep 3 starts at 1280 s: 30 s grace + 60 s
  // too fast = 1370 s. Rep 4's praise falls while three cues are already in the 20 min
  // window and is dropped. Rep 5 (starts 1930 s: the fast rep 3 was 30 s shorter) is
  // announced anyway, which fills the window again, so rep 5's praise is dropped too.
  assert.deepStrictEqual(cues.map(at), ["start@10", "spotOn@850", "spotOn@1190", "above@1370", "lastRep@1930"]);
  assert.deepStrictEqual(cues.find((c) => c.type === "above").step, { kind: "rep", i: 3, n: 5 });
  assertBudget(cues);

  const sum = summarize(state);
  assert.strictEqual(sum.stepsReached, 12);
  assert.strictEqual(sum.planLost, false);
  console.log(`✅ Interval session: ${types.join(" → ")}`);
}

// 2b. The last-rep call may come right after another cue (it ignores the gap and the window).
{
  const plan = [{
    type: "repeat",
    iterations: 3,
    steps: [
      { type: "interval", exerciseName: "Hill", condition_type: "time_sec", condition_value: 150, target_type: "pace.exact", target_value: "4:10" },
      { type: "rest", condition_type: "time_sec", condition_value: 30, target_type: "no.target" },
    ],
  }];
  const state = createSession({ timeline: buildTimeline(plan), sport: "Run" });
  const reps = [];
  for (let i = 0; i < 3; i++) reps.push({ sec: 150, speed: 4.0, hr: 165 }, { sec: 30, speed: 2, hr: 140 });
  const cues = run(state, makePoints(reps));
  const at = (c) => `${c.type}@${Math.round((c.atMs - T0) / 1000)}`;
  // Rep 1's praise at 150 s is too close to the start cue; rep 2's at 330 s is not.
  assert.deepStrictEqual(cues.map(at), ["start@10", "spotOn@330", "lastRep@360"]);
  console.log("✅ Last rep announced 30 s after the previous cue");
}

// 3. GPS fix 14 min in: the plan still counts from the start, without cues for steps already done.
{
  const state = createSession({ timeline: buildTimeline(INTERVALS), workoutName: "5×1000m", sport: "Run" });
  const cues = run(state, makePoints([{ sec: 60, speed: 4.0, hr: 160 }], { startT: 840 }));
  assert.deepStrictEqual(cues.map((c) => c.type), ["start"]);
  assert.strictEqual(state.stepIdx, 1, "past the 10 min warmup, in rep 1");
  console.log("✅ Late GPS fix: lands in the right step, no catch-up cues");
}

// 4. Long steady run without a plan: a check-in every 20 quiet minutes, HR drift called once.
{
  const state = createSession({ timeline: [], sport: "Run" });
  const drift = (s) => (s < 30 * 60 ? 142 : 142 + Math.min(16, (s - 30 * 60) / 60)); // +16 bpm over 16 min
  const cues = run(state, makePoints([{ sec: 90 * 60, speed: 3.0, hr: drift }]));
  const types = cues.map((c) => c.type);
  assert.strictEqual(types.filter((t) => t === "hrDrift").length, 1, `one drift cue, got ${types.join(", ")}`);
  assert.ok(types.filter((t) => t === "checkIn").length >= 3, "check-ins keep a 90 min run company");
  assertBudget(cues);
  const drifted = cues.find((c) => c.type === "hrDrift");
  assert.ok(drifted.pct >= 8, "reported rise is at least the threshold");
  console.log(`✅ Steady run: ${types.join(" → ")}`);
}

// 5. Off-pace while standing at a traffic light is not "too slow".
{
  const plan = [{ type: "interval", exerciseName: "Tempo", condition_type: "time", condition_value: 20, target_type: "pace.exact", target_value: "5:00" }];
  const state = createSession({ timeline: buildTimeline(plan), sport: "Run" });
  const cues = run(state, makePoints([
    { sec: 300, speed: 3.33, hr: 150 },
    { sec: 120, stationary: true, hr: 120 },
    { sec: 300, speed: 3.33, hr: 150 },
  ]));
  assert.ok(!cues.some((c) => c.type === "below"), cues.map((c) => c.type).join(", "));
  console.log("✅ Stationary points don't count as off target");
}

// 6. A lap-button step can't be followed: plan cues stop, session cues continue.
{
  const plan = [
    { type: "warmup", condition_type: "lap.button", target_type: "no.target" },
    { type: "interval", exerciseName: "Tempo", condition_type: "time", condition_value: 20, target_type: "pace.exact", target_value: "5:00" },
  ];
  const state = createSession({ timeline: buildTimeline(plan), sport: "Run" });
  const cues = run(state, makePoints([{ sec: 30 * 60, speed: 2.5, hr: 140 }]));
  assert.strictEqual(state.planLost, true);
  assert.ok(!cues.some((c) => c.type === "below"), "no pace verdicts once the plan is lost");
  assert.ok(cues.some((c) => c.type === "checkIn"));
  console.log("✅ Lap-button step: plan cues stop, check-ins continue");
}

// 7. Text fits on a watch and reads right in English and Dutch.
{
  const cue = { type: "above", step: { kind: "rep", i: 3, n: 5 }, actual: { metric: "speed", value: 4.6 }, target: { kind: "pace", secPerKm: 250 } };
  assert.deepStrictEqual(renderCue("en", cue), { title: "rooka coach", body: "Rep 3/5: 3:37/km, target 4:10/km. Ease off a bit." });
  assert.strictEqual(renderCue("nl", cue).body, "Herhaling 3/5: 3:37/km, doel 4:10/km. Iets rustiger.");
  const checkIn = renderCue("en", { type: "checkIn", elapsedMin: 40, avgSpeed: 1000 / 332, hr: 148 }, { sport: "Run" });
  assert.strictEqual(checkIn.body, "40 min in · 5:32/km · ♥ 148. Steady 👌");
  const start = renderCue("en", { type: "start", workoutName: null, sport: "Run" });
  assert.strictEqual(start.body, "rooka is watching your run 👀");
  for (const lang of ["en", "nl", "de", "es", "fr"]) {
    for (const c of [cue, { type: "lastRep" }, { type: "hrDrift", pct: 9 }, { type: "spotOn", step: { kind: "rep", i: 2, n: 5 }, pct: 92 }]) {
      const { body } = renderCue(lang, c);
      assert.ok(!body.includes("push.live"), `missing ${lang} text for ${c.type}`);
      assert.ok(body.length <= 60, `${lang} ${c.type} is ${body.length} chars: ${body}`);
    }
  }
  console.log("✅ Cue texts in 5 languages, all ≤ 60 characters");
}

console.log("\n🎉 Live coach tests passed");
process.exit(0);
