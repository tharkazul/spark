// Live session worker + email webhook, end to end with a fake Garmin and a fake push.
// Uses a throwaway database.
const path = require("path");
const os = require("os");
process.env.DB_PATH = path.join(os.tmpdir(), `rooka_livesession_test_${process.pid}.db`);
process.env.LIVETRACK_WEBHOOK_SECRET = "test-secret";

const assert = require("assert");
const express = require("express");
const db = require("./services/db");

// Fakes must be in place before the worker takes its references.
const pushes = [];
require("./services/pushNotificationService").sendPushToUser = async (userId, msg) => {
  pushes.push({ userId, ...msg });
  return { data: [{ status: "ok" }] };
};
const { LiveTrackClient } = require("./services/liveTrack");
const fakeGarmin = { profileId: 123, points: [] };
LiveTrackClient.prototype.authenticate = async function () {
  this.headers = {};
};
LiveTrackClient.prototype.getSession = async () => ({
  viewable: true,
  end: new Date(Date.now() + 24 * 3600e3).toISOString(),
  publisher: { connectUserProfileId: fakeGarmin.profileId },
});
LiveTrackClient.prototype.getTrackPoints = async function (begin) {
  return fakeGarmin.points.filter((p) => !begin || p.dateTime > begin);
};

const { startLiveSession, listLiveSessions, settings: liveSettings } = require("./services/liveSessionWorker");
const { getAMSDateString } = require("./services/utils");
const liveCoachRoutes = require("./routes/liveCoach");

const get = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => (e ? rej(e) : res(r))));
const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { return e ? rej(e) : res(this); }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function intervalPoints(sessionStartMs) {
  // 10 min warmup, then 1000 m at 4.6 m/s (plan says 4:10/km = 4.0 m/s), then stop.
  const pts = [];
  let t = 0;
  let d = 0;
  const add = (sec, speed, hr, extra = {}) => {
    for (let s = 0; s < sec; s += 10) {
      t += 10;
      d += speed * 10;
      pts.push({
        dateTime: new Date(sessionStartMs + t * 1000).toISOString(),
        durationSecs: t,
        distanceMeters: d,
        speedMetersPerSec: speed,
        heartRateBeatsPerMin: hr,
        powerWatts: 0,
        activityType: "RUNNING",
        pointStatus: "MOVING",
        position: { lat: 52.3, lon: 4.9 },
        eventTypes: [],
        ...extra,
      });
    }
  };
  add(600, 2.8, 135);
  add(220, 4.6, 168);
  pts[pts.length - 1].eventTypes = ["END"];
  return pts;
}

async function waitFor(fn, ms = 5000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const v = await fn();
    if (v) return v;
    await sleep(50);
  }
  throw new Error("timed out");
}

(async () => {
  console.log("🏁 Running live session worker tests...\n");
  await sleep(300); // let db.js and the worker create their tables

  const user = await run(`INSERT INTO users (username, language) VALUES ('livetest', 'nl')`);
  const userId = user.lastID;
  await run(`INSERT INTO micro_plan (user_id, date, sport, description, steps_json) VALUES (?, ?, 'Run', 'Drempeltraining', ?)`, [
    userId,
    getAMSDateString(),
    JSON.stringify([
      { type: "warmup", condition_type: "time", condition_value: 10, target_type: "no.target" },
      { type: "repeat", iterations: 2, steps: [
        { type: "interval", exerciseName: "1000m", condition_type: "distance", condition_value: 1000, target_type: "pace.exact", target_value: "4:10" },
        { type: "rest", condition_type: "time_sec", condition_value: 90, target_type: "no.target" },
      ] },
    ]),
  ]);

  // 1. The email webhook finds the athlete by address and starts a session.
  const app = express();
  app.use(express.json());
  app.use("/", liveCoachRoutes);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const words = require("./services/inboxWords");
  assert.ok(words.length >= 1000, "enough words for four-word addresses");
  assert.strictEqual(new Set(words).size, words.length, "no duplicate words");
  assert.ok(words.every((w) => /^[a-z]{3,9}$/.test(w)), "plain lowercase words only");

  const address = await liveCoachRoutes.getInboxAddress(userId);
  assert.match(address, /^[a-z]+(-[a-z]+){3}@rookacoach\.com$/);
  assert.ok(address.split("@")[0].split("-").every((w) => words.includes(w)), "address is made of list words");
  assert.strictEqual(await liveCoachRoutes.getInboxAddress(userId), address, "address is stable");

  // Four words someone else already has: drawn again instead of failing.
  const crypto = require("crypto");
  const taken = address.split("@")[0];
  const realRandomInt = crypto.randomInt;
  let forced = 4;
  crypto.randomInt = (max) => (forced-- > 0 ? words.indexOf(taken.split("-")[3 - forced]) : realRandomInt(max));
  const second = await run(`INSERT INTO users (username) VALUES ('livetest2')`);
  const secondAddress = await liveCoachRoutes.getInboxAddress(second.lastID);
  crypto.randomInt = realRandomInt;
  assert.ok(forced < 0, "the taken code was drawn first");
  assert.notStrictEqual(secondAddress, address, "collision drew new words");

  // Old 10-letter addresses keep resolving.
  const legacy = await run(`INSERT INTO users (username, livetrack_inbox) VALUES ('livetest3', 'xvftfhqb9q')`);
  assert.strictEqual(await liveCoachRoutes.getInboxAddress(legacy.lastID), "xvftfhqb9q@rookacoach.com");

  const post = (body, secret = "test-secret") =>
    fetch(`${base}/api/webhooks/livetrack`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-rooka-webhook-secret": secret },
      body: JSON.stringify(body),
    });
  const link = "https://livetrack.garmin.com/session/db4475a3-e97b-8b4c-9a88-cf993d02a100/token/B956C4215B873EB2EBFC2A1C831B2163";

  // 0. Parked (the default): the email is accepted and dropped, the link is never opened.
  assert.strictEqual(liveSettings.enabled, false, "live coaching ships switched off");
  const parked = await post({ to: address, url: link });
  assert.strictEqual(parked.status, 200);
  assert.ok((await parked.json()).ignored, "email dropped while parked");
  assert.strictEqual((await get(`SELECT COUNT(*) AS n FROM live_sessions`)).n, 0, "no session, so no LiveTrack request");
  await assert.rejects(startLiveSession({ userId, url: link, source: "admin" }), (e) => e.status === 410, "admin start refused too");
  console.log("✅ Parked: LiveTrack emails are dropped without opening the link");
  liveSettings.enabled = true; // the rest tests the engine itself

  assert.strictEqual((await post({ to: address, url: link }, "wrong")).status, 401, "wrong secret refused");
  assert.strictEqual((await post({ to: "nobody@rookacoach.com", url: link })).status, 404, "unknown address refused");
  assert.strictEqual((await post({ to: address, url: "no link here" })).status, 400, "mail without a link refused");

  fakeGarmin.points = intervalPoints(Date.now() - 900e3);
  const res = await post({ to: address.toUpperCase(), url: link });
  assert.strictEqual(res.status, 202);
  console.log("✅ Webhook: secret, address lookup and link checks");

  // 2. The worker coaches the session in the athlete's language and closes it on END.
  const row = await waitFor(async () => {
    const r = await get(`SELECT * FROM live_sessions WHERE user_id = ?`, [userId]);
    return r && r.status === "ended" ? r : null;
  });
  const bodies = pushes.map((p) => p.body);
  assert.strictEqual(pushes[0].title, "rooka coach");
  assert.strictEqual(bodies[0], "rooka kijkt mee: Drempeltraining 👀");
  assert.ok(bodies.some((b) => b.startsWith("Herhaling 1/2: 3:37/km, doel 4:10/km")), bodies.join(" | "));
  assert.strictEqual(row.token, null, "LiveTrack token erased at the end");
  assert.strictEqual(row.workout_name, "Drempeltraining");
  const metrics = JSON.parse(row.last_metrics_json);
  assert.ok(!("position" in metrics) && !("lat" in metrics), "no location stored");
  assert.strictEqual(JSON.parse(row.summary_json).durationMin, 14);
  assert.strictEqual((await get(`SELECT garmin_profile_id FROM users WHERE id = ?`, [userId])).garmin_profile_id, 123);
  console.log(`✅ Worker: ${bodies.join(" | ")}`);

  // The coach chat can read back what was said on the watch.
  const recent = await require("./services/liveSessionWorker").recentLiveSummaries(userId);
  assert.strictEqual(recent.length, 1);
  assert.strictEqual(recent[0].workoutName, "Drempeltraining");
  assert.deepStrictEqual(recent[0].cues, bodies);

  // 3. The same link twice does not start a second session.
  assert.strictEqual((await post({ to: address, url: link })).status, 202);
  assert.strictEqual((await listLiveSessions()).length, 1);
  console.log("✅ Duplicate email ignored");

  // 4. A session from another Garmin account is refused for this address.
  fakeGarmin.profileId = 999;
  const other = await post({ to: address, url: link.replace("db4475a3", "aaaaaaaa") });
  assert.strictEqual(other.status, 403);
  console.log("✅ Session from a different Garmin account refused");

  server.close();
  console.log("\n🎉 Live session worker tests passed");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
