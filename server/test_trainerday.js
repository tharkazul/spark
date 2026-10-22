// TrainerDay: rooka steps -> workoutBlocks, OAuth state and token refresh, and the
// calendar push (create, update the same event, delete). Throwaway database, fake API.
const path = require("path");
const os = require("os");
process.env.DB_PATH = path.join(os.tmpdir(), `rooka_trainerday_test_${process.pid}.db`);
process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
process.env.JWT_SECRET = "test-secret";
process.env.TRAINERDAY_CLIENT_ID = "test-client";
process.env.TRAINERDAY_CLIENT_SECRET = "test-secret-value";
process.env.TRAINERDAY_REDIRECT_URI = "https://api.rooka.io/trainerdayredirect";
process.env.TRAINERDAY_BASE = "https://td.test";
const assert = require("assert");
const db = require("./services/db");
const { encrypt, decrypt } = require("./services/crypto");
const td = require("./services/trainerday");

const run = (q, p = []) => new Promise((r, j) => db.run(q, p, (e) => (e ? j(e) : r())));
const get = (q, p = []) => new Promise((r) => db.get(q, p, (e, row) => r(row)));

console.log("🚴 Running TrainerDay tests...\n");

// ---------------------------------------------------------------------------
// Fake TrainerDay API
// ---------------------------------------------------------------------------
let calls = [];
let tokenReply = null;
let nextEventId = 1;
const events = new Map();
global.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const body = opts.body && typeof opts.body === "string" && opts.headers["Content-Type"] === "application/json" ? JSON.parse(opts.body) : opts.body;
  calls.push({ method: opts.method || "GET", path: u.pathname, body, auth: opts.headers && opts.headers.Authorization });
  const reply = (status, json) => ({
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => null },
    json: async () => json,
    text: async () => (json === undefined ? "" : JSON.stringify(json)),
  });
  if (u.pathname === "/oauth/token") {
    await new Promise((r) => setTimeout(r, 20)); // lets parallel callers overlap
    return typeof tokenReply === "function" ? tokenReply(new URLSearchParams(opts.body)) : reply(200, tokenReply);
  }
  if (u.pathname === "/oauth/token/revoke") return reply(200, undefined);
  if (u.pathname === "/api/v1/athlete") return reply(200, { ftp: 250, username: "rider" });
  if (u.pathname === "/api/v2/calendar/events" && opts.method === "POST") {
    const id = `evt${nextEventId++}`;
    events.set(id, body);
    return reply(201, { _id: id, ...body });
  }
  const m = u.pathname.match(/^\/api\/v2\/calendar\/events\/(.+)$/);
  if (m) {
    if (!events.has(m[1])) return reply(404, { msg: "Event not found" });
    if (opts.method === "PUT") {
      events.set(m[1], body);
      return reply(200, { _id: m[1], ...body });
    }
    if (opts.method === "DELETE") {
      events.delete(m[1]);
      return reply(200, { msg: "deleted", eventId: m[1] });
    }
  }
  return reply(404, { msg: "no route" });
};

const ymd = (offset) => {
  const d = new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" })}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

(async () => {
  // -------------------------------------------------------------------------
  // 1. Converter
  // -------------------------------------------------------------------------
  const hrZones = [
    { zone: 1, min: 95, max: 114 },
    { zone: 2, min: 114, max: 133 },
  ];
  const steps = [
    { type: "warmup", exerciseName: "Progressive Bike Warmup", condition_type: "time", condition_value: 10, target_type: "heart.rate.zone", zone: 1 },
    {
      type: "repeat",
      iterations: 5,
      steps: [
        { type: "interval", exerciseName: "High Cadence Spin-Up (110-120 rpm)", condition_type: "time_sec", condition_value: 30, target_type: "power.zone", zone: 2 },
        { type: "rest", condition_type: "time_sec", condition_value: 30, target_type: "power.zone", zone: 1 },
      ],
    },
    { type: "interval", exerciseName: "Aero Position Endurance", condition_type: "time", condition_value: 20, target_type: "power.exact", target_value: "190" },
    { type: "interval", exerciseName: "Threshold", condition_type: "time", condition_value: 300, target_type: "power.zone", zone: 4 },
    { type: "interval", exerciseName: "Brick Run", condition_type: "distance", condition_value: 5000, target_type: "pace.exact", target_value: "5:30" },
    { type: "cooldown", exerciseName: "Easy Spin Down", condition_type: "time", condition_value: 5, target_type: "no.target" },
  ];
  const blocks = td.toWorkoutBlocks(steps, { ftp: 250, hrZones });
  assert.strictEqual(blocks.length, 6);

  const [warm, rep, exact, thr, brick, cool] = blocks;
  assert.deepStrictEqual(
    { type: warm.type, reps: warm.reps, n: warm.segments.length },
    { type: "segment", reps: null, n: 1 },
  );
  const w = warm.segments[0];
  assert.strictEqual(w.durationType, "second");
  assert.strictEqual(w.durationValue, 600, "condition_type time is minutes");
  assert.strictEqual(w.segmentType, "warm-up");
  assert.strictEqual(w.controlMode, "erg");
  assert.deepStrictEqual(w.targets, [{ type: "primary", min: td.HR_ZONE_PCT[1], max: null }], "HR zone rides as %FTP in ERG");
  assert.deepStrictEqual(w.notes, [{ timeOffset: 0, text: "HR Z1 95-114 bpm" }], "the athlete's bpm band is on screen");
  console.log("✅ Minutes become seconds; an HR zone rides at its %FTP with the bpm band as a note");

  assert.strictEqual(rep.type, "repetition");
  assert.strictEqual(rep.reps, 5);
  assert.strictEqual(rep.segments.length, 2, "a repeat is one block holding one pass");
  assert.strictEqual(rep.segments[0].durationValue, 30, "time_sec stays seconds");
  assert.strictEqual(rep.segments[0].segmentType, "interval");
  assert.deepStrictEqual(rep.segments[0].targets, [
    { type: "primary", min: 65, max: null },
    { type: "cadence", min: 110, max: 120 },
  ]);
  assert.strictEqual(rep.segments[1].segmentType, "rest");
  assert.deepStrictEqual(rep.segments[1].targets, [{ type: "primary", min: 50, max: null }]);
  console.log("✅ repeat -> repetition block with reps; power zones map to Coggan %FTP; rpm becomes a cadence target");

  assert.deepStrictEqual(exact.segments[0].targets, [{ type: "primary", min: 76, max: null }], "190 W / 250 W FTP = 76%");
  assert.strictEqual(thr.segments[0].durationValue, 300, "a 'time' of 300 is already seconds");
  assert.deepStrictEqual(thr.segments[0].targets, [{ type: "primary", min: 98, max: null }]);
  console.log("✅ Watts become %FTP (190 W at 250 W FTP = 76%)");

  const b = brick.segments[0];
  assert.deepStrictEqual([b.durationType, b.durationValue], ["meter", 5000], "distance is meters");
  assert.strictEqual(b.segmentType, "free-ride");
  assert.strictEqual(b.controlMode, null);
  assert.deepStrictEqual(b.notes, [{ timeOffset: 0, text: "5:30 /km" }]);
  const c = cool.segments[0];
  assert.deepStrictEqual([c.segmentType, c.controlMode, c.targets.length], ["free-ride", null, 0], "no.target is a free ride");
  console.log("✅ Distance in meters; pace and no target ride free (no ERG)");

  const noFtp = td.toWorkoutBlocks([steps[2]], {});
  assert.strictEqual(noFtp[0].segments[0].segmentType, "free-ride", "watts without any FTP can't be a percentage");
  assert.deepStrictEqual(noFtp[0].segments[0].notes, [{ timeOffset: 0, text: "190 W" }]);
  const nested = td.toWorkoutBlocks(
    [{ type: "repeat", iterations: 2, steps: [{ type: "repeat", iterations: 3, steps: [{ type: "interval", condition_type: "time_sec", condition_value: 20, target_type: "power.zone", zone: 6 }] }, { type: "rest", condition_type: "time", condition_value: 4, target_type: "no.target" }] }],
    {},
  );
  assert.strictEqual(nested.length, 1);
  assert.strictEqual(nested[0].reps, 2);
  assert.strictEqual(nested[0].segments.length, 4, "an inner repeat is unrolled: 3 on + 1 rest");
  assert.strictEqual(nested[0].segments[0].targets[0].min, 135);
  console.log("✅ Watts without FTP fall back to a note; nested repeats are unrolled");

  const event = td.buildCalendarEvent({ date: "2026-10-23", title: "Spin-ups & aero endurance", details: "Keep it smooth.", steps }, { ftp: 250, hrZones });
  assert.strictEqual(event.calendarDate, "2026-10-23");
  assert.strictEqual(event.embedWorkout.title, "rooka: Spin-ups & aero endurance");
  assert.strictEqual(event.embedWorkout.description, "Keep it smooth.");
  assert.strictEqual(event.embedWorkout.workoutType, "bike");
  assert.strictEqual(event.percentOfHR, false);
  // 10 + 5x1 + 20 + 5 + 5 km at 2 min/km (10) + 5
  assert.strictEqual(event.embedWorkout.durationMinutes, 55);
  console.log("✅ Calendar event: date, rooka title, bike, total 55 minutes");

  assert.ok(td.isBikeSport("Bike") && td.isBikeSport("BIKE") && td.isBikeSport("indoor cycling"));
  assert.ok(!td.isBikeSport("Run") && !td.isBikeSport("Swim") && !td.isBikeSport(""));
  console.log("✅ Only cycling sports go to TrainerDay");

  // -------------------------------------------------------------------------
  // 2. OAuth state and rate limit
  // -------------------------------------------------------------------------
  const state = td.signState(42);
  assert.strictEqual(td.verifyState(state), 42);
  assert.strictEqual(td.verifyState(state.slice(0, -2) + "xx"), null, "a tampered signature is rejected");
  assert.strictEqual(td.verifyState(td.signState(42, Date.now() - 20 * 60 * 1000)), null, "an expired state is rejected");
  const url = new URL(td.authorizeUrl(42));
  assert.strictEqual(url.origin + url.pathname, "https://td.test/oauth/authorize");
  assert.strictEqual(url.searchParams.get("redirect_uri"), "https://api.rooka.io/trainerdayredirect");
  assert.strictEqual(url.searchParams.get("scope"), "athlete:read calendar:read calendar:write");
  assert.ok(!url.toString().includes("test-secret-value"), "the secret never goes in the URL");
  console.log("✅ Authorize URL carries the registered redirect, the three scopes and a signed state");

  const t0 = 1_000_000;
  for (let i = 0; i < 95; i++) td._takeSlot(999, t0 + i);
  assert.throws(() => td._takeSlot(999, t0 + 100), td.TrainerDayRateLimitError, "the 96th request in 15 minutes waits");
  td._takeSlot(999, t0 + 15 * 60 * 1000 + 1); // the window has moved on
  td._requestLog.clear();
  console.log("✅ Requests are capped under 100 per 15 minutes");

  // -------------------------------------------------------------------------
  // 3. Token refresh
  // -------------------------------------------------------------------------
  await new Promise((r) => setTimeout(r, 2000)); // db.js migrations
  await run(`INSERT INTO users (id, username, password_hash) VALUES (1, 'rider', 'x'), (2, 'revoked', 'x')`);
  const now = Math.floor(Date.now() / 1000);
  const saveRow = (uid, access, refresh, expiresAt) =>
    run(`INSERT OR REPLACE INTO trainerday_tokens (user_id, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?)`, [uid, encrypt(access), encrypt(refresh), expiresAt]);

  await saveRow(1, "access-1", "refresh-1", now + 3 * 3600);
  calls = [];
  assert.strictEqual(await td.getValidAccessToken(1), "access-1");
  assert.strictEqual(calls.length, 0, "a token valid for hours is used as is");

  await saveRow(1, "access-1", "refresh-1", now + 120); // expires within the 5-minute margin
  tokenReply = (form) => {
    assert.strictEqual(form.get("grant_type"), "refresh_token");
    assert.strictEqual(form.get("refresh_token"), "refresh-1");
    assert.strictEqual(form.get("client_id"), "test-client");
    return { status: 200, ok: true, headers: { get: () => null }, json: async () => ({ access_token: "access-2", refresh_token: "refresh-2", expires_in: 21600 }) };
  };
  calls = [];
  const [a1, a2] = await Promise.all([td.getValidAccessToken(1), td.getValidAccessToken(1)]);
  assert.deepStrictEqual([a1, a2], ["access-2", "access-2"]);
  assert.strictEqual(calls.filter((c) => c.path === "/oauth/token").length, 1, "parallel callers share one refresh");
  let row = await get(`SELECT * FROM trainerday_tokens WHERE user_id = 1`);
  assert.strictEqual(decrypt(row.access_token), "access-2");
  assert.strictEqual(decrypt(row.refresh_token), "refresh-2");
  assert.notStrictEqual(row.access_token, "access-2", "tokens are stored encrypted");
  assert.ok(Math.abs(row.expires_at - (now + 21600)) <= 2, "expiry follows expires_in (6 hours)");
  console.log("✅ A token about to expire is refreshed once, stored encrypted with its new 6-hour expiry");

  await saveRow(1, "access-2", "refresh-2", now - 10);
  tokenReply = { access_token: "access-3", expires_in: 21600 }; // no rotation
  assert.strictEqual(await td.getValidAccessToken(1), "access-3");
  row = await get(`SELECT * FROM trainerday_tokens WHERE user_id = 1`);
  assert.strictEqual(decrypt(row.refresh_token), "refresh-2", "the refresh token is kept when TrainerDay doesn't rotate it");
  console.log("✅ The old refresh token is kept when none comes back");

  await saveRow(2, "dead", "dead-refresh", now - 10);
  await run(`INSERT INTO trainerday_events (user_id, workout_key, event_id, calendar_date) VALUES (2, 'x:bike', 'e', '2099-01-01')`);
  const revokedReply = () => ({ status: 400, ok: false, headers: { get: () => null }, json: async () => ({ error: "invalid_grant", error_description: "grant request is invalid" }) });
  tokenReply = revokedReply;
  assert.strictEqual(await td.getValidAccessToken(2), null);
  assert.strictEqual(await get(`SELECT 1 AS ok FROM trainerday_tokens WHERE user_id = 2`), undefined, "revoked in TrainerDay -> disconnected here");
  assert.strictEqual(await get(`SELECT 1 AS ok FROM trainerday_events WHERE user_id = 2`), undefined);
  console.log("✅ A refresh token revoked in TrainerDay disconnects the athlete");

  // -------------------------------------------------------------------------
  // 4. Push: create, update the same event, delete when the session goes
  // -------------------------------------------------------------------------
  await saveRow(1, "access-ok", "refresh-ok", now + 3 * 3600);
  const day = ymd(1);
  const ride = { date: day, sport: "BIKE", title: "Sweet spot", description: "2x20 at sweet spot", steps: [steps[2]] };

  calls = [];
  let r = await td.pushWorkoutsToTrainerDay(1, [ride, { date: day, sport: "RUN", title: "Easy run", steps: [] }]);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.syncedCount, 1, "only the bike workout is sent");
  const posts = calls.filter((c) => c.method === "POST" && c.path === "/api/v2/calendar/events");
  assert.strictEqual(posts.length, 1);
  assert.strictEqual(posts[0].auth, "Bearer access-ok");
  assert.strictEqual(posts[0].body.calendarDate, day);
  assert.strictEqual(posts[0].body.embedWorkout.workoutBlocks[0].segments[0].targets[0].min, 76, "TrainerDay's FTP (250) is used for watts");
  row = await get(`SELECT * FROM trainerday_events WHERE user_id = 1`);
  assert.strictEqual(row.event_id, "evt1");
  console.log("✅ A bike workout is created on the TrainerDay calendar and its event id stored");

  calls = [];
  r = await td.pushWorkoutsToTrainerDay(1, [{ ...ride, title: "Sweet spot (longer)" }]);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(calls.filter((c) => c.path.startsWith("/api/v2")).map((c) => `${c.method} ${c.path}`), ["PUT /api/v2/calendar/events/evt1"]);
  assert.strictEqual(events.size, 1, "no duplicate");
  assert.strictEqual(events.get("evt1").embedWorkout.title, "rooka: Sweet spot (longer)");
  console.log("✅ Sending it again updates the same event (PUT), no duplicate");

  r = await td.pushWorkoutsToTrainerDay(1, [{ date: day, sport: "Run", title: "Easy run" }]);
  assert.strictEqual(r.body.skipped, true, "a run-only payload is skipped, not a failure");

  // The plan: a bike session tomorrow (changed in rooka), none the day after.
  await run(`INSERT INTO micro_plan (user_id, date, sport, description, details, target_rooka, steps_json) VALUES (1, ?, 'Bike', 'Sweet spot (moved warm-up)', '2x20', 60, ?)`, [day, JSON.stringify(steps)]);
  calls = [];
  r = await td.syncTrainerDayCalendar(1);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual(calls.filter((c) => c.path.startsWith("/api/v2")).map((c) => `${c.method} ${c.path}`), ["PUT /api/v2/calendar/events/evt1"], "a plan change updates the event");
  calls = [];
  r = await td.syncTrainerDayCalendar(1);
  assert.strictEqual(calls.length, 0, "nothing changed -> no requests");
  console.log("✅ The background sync updates changed sessions and spends no requests otherwise");

  await run(`DELETE FROM micro_plan WHERE user_id = 1`);
  calls = [];
  r = await td.syncTrainerDayCalendar(1);
  assert.deepStrictEqual(calls.filter((c) => c.path.startsWith("/api/v2")).map((c) => `${c.method} ${c.path}`), ["DELETE /api/v2/calendar/events/evt1"]);
  assert.strictEqual(events.size, 0);
  assert.strictEqual(await get(`SELECT 1 AS ok FROM trainerday_events WHERE user_id = 1`), undefined);
  console.log("✅ A session removed from the plan is deleted from TrainerDay");

  calls = [];
  await td.disconnect(1);
  const revokes = calls.filter((c) => c.path === "/oauth/token/revoke");
  assert.strictEqual(revokes.length, 2, "both tokens are revoked");
  assert.strictEqual(new URLSearchParams(revokes[0].body).get("token"), "refresh-ok");
  assert.strictEqual(await td.isConnected(1), false);
  console.log("✅ Disconnect revokes both tokens and deletes them");

  console.log("\n🎉 All TrainerDay tests passed!");
  setTimeout(() => {
    try { require("fs").unlinkSync(process.env.DB_PATH); } catch (_) {}
    process.exit(0);
  }, 200);
})().catch((e) => {
  console.error("❌", e);
  try { require("fs").unlinkSync(process.env.DB_PATH); } catch (_) {}
  process.exit(1);
});
