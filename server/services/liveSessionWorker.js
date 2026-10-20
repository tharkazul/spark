/**
 * Runs live coaching for every active Garmin LiveTrack session.
 *
 * One runner per session polls the track points every POLL_MS, feeds them to the
 * rule engine (services/liveCoach.js) and pushes its cues through rooka's own push
 * (it shows on the watch within seconds; Garmin's own spectator messages take 1–2 min).
 *
 * Privacy: track points live only in memory. The table keeps the latest effort numbers
 * (no position), the cues that were sent and a short summary. The LiveTrack token, which
 * would let anyone follow the athlete's location, is erased when the session ends.
 */
const db = require("./db");
const { LiveTrackClient, parseLiveTrackUrl } = require("./liveTrack");
const { buildTimeline, createSession, processPoint, summarize, renderCue } = require("./liveCoach");
const { sendPushToUser } = require("./pushNotificationService");
const { resolveZonesForUser } = require("./athleteZones");
const { getAMSDateString } = require("./utils");

const POLL_MS = 10 * 1000; // LiveTrack sends a point every ~10 s while moving
const NO_POINTS_END_MS = 10 * 60 * 1000; // no new points for 10 min after the first: done
const FIRST_POINT_WAIT_MS = 60 * 60 * 1000; // wait this long for a GPS fix before giving up
const MAX_CONSECUTIVE_ERRORS = 30; // ~5 min of failed polls

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS live_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    garmin_session_id TEXT NOT NULL UNIQUE,
    token TEXT,
    source TEXT,
    status TEXT NOT NULL DEFAULT 'waiting',
    plan_id INTEGER,
    workout_name TEXT,
    sport TEXT,
    publisher_profile_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    first_point_at TEXT,
    last_point_at TEXT,
    ended_at TEXT,
    last_metrics_json TEXT,
    cues_json TEXT DEFAULT '[]',
    summary_json TEXT,
    error TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_live_sessions_user ON live_sessions(user_id, created_at)`);
  // Personal inbound address code (<code>@live.rooka.io) and the Garmin profile that
  // first sent a session to it; later sessions from another profile are refused.
  db.run(`ALTER TABLE users ADD COLUMN livetrack_inbox TEXT`, () => {
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_livetrack_inbox ON users(livetrack_inbox)`);
  });
  db.run(`ALTER TABLE users ADD COLUMN garmin_profile_id INTEGER`, () => {});
});

const dbGet = (sql, params = []) => new Promise((res, rej) => db.get(sql, params, (e, r) => (e ? rej(e) : res(r))));
const dbAll = (sql, params = []) => new Promise((res, rej) => db.all(sql, params, (e, r) => (e ? rej(e) : res(r))));
const dbRun = (sql, params = []) =>
  new Promise((res, rej) =>
    db.run(sql, params, function (e) {
      return e ? rej(e) : res(this);
    }),
  );

/** rooka sport for a Garmin activityType (RUNNING, ROAD_BIKING, OPEN_WATER_SWIMMING, ...). */
function sportFromActivityType(type) {
  const t = String(type || "").toUpperCase();
  if (/RUN/.test(t)) return "Run";
  if (/CYCL|BIK|RIDE/.test(t)) return "Bike";
  if (/SWIM/.test(t)) return "Swim";
  if (/WALK|HIK/.test(t)) return "Walk";
  return null;
}

/** Today's planned workout for this sport, with parsed steps, or null. */
async function findTodaysPlan(userId, sport) {
  if (!sport) return null;
  const rows = await dbAll(
    `SELECT id, sport, description, steps_json FROM micro_plan WHERE user_id = ? AND date = ? ORDER BY id`,
    [userId, getAMSDateString()],
  );
  for (const r of rows) {
    if (String(r.sport || "").toLowerCase() !== sport.toLowerCase()) continue;
    let steps = [];
    try {
      steps = JSON.parse(r.steps_json || "[]");
    } catch (_) {}
    return { id: r.id, name: r.description || null, steps: Array.isArray(steps) ? steps : [] };
  }
  return null;
}

/** Only effort numbers are kept, never the position. */
function metricsOf(p) {
  return {
    at: p.dateTime,
    durationSecs: p.durationSecs ?? p.totalDurationSecs ?? null,
    distanceMeters: p.distanceMeters ?? p.totalDistanceMeters ?? null,
    speed: p.speedMetersPerSec ?? p.speed ?? null,
    hr: p.heartRateBeatsPerMin ?? null,
    power: p.powerWatts ?? null,
    cadence: p.cadenceCyclesPerMin ?? null,
    activityType: p.activityType ?? null,
  };
}

const runners = new Map(); // live_sessions.id -> Runner

class Runner {
  constructor(row, { resume = false } = {}) {
    this.row = row;
    this.client = new LiveTrackClient({ sessionId: row.garmin_session_id, token: row.token });
    this.state = null;
    this.lang = "en";
    this.lastMs = 0;
    this.lastArrivalMs = 0;
    this.createdMs = Date.parse(`${row.created_at}Z`) || Date.now();
    this.errors = 0;
    this.resume = resume;
    this.cues = JSON.parse(row.cues_json || "[]");
    this.stopped = false;
    this.timer = null;
  }

  start() {
    this.schedule(0);
  }

  schedule(ms) {
    if (this.stopped) return;
    this.timer = setTimeout(() => this.tick().catch((e) => console.error(`[live ${this.row.id}] tick failed:`, e)), ms);
  }

  async initState(firstPoint) {
    const user = await dbGet(`SELECT language FROM users WHERE id = ?`, [this.row.user_id]);
    this.lang = (user && user.language) || "en";
    const sport = sportFromActivityType(firstPoint.activityType);
    const plan = await findTodaysPlan(this.row.user_id, sport);
    let timeline = [];
    if (plan && plan.steps.length) {
      const { hrZones, powerZones } = await resolveZonesForUser(this.row.user_id, sport || "default");
      timeline = buildTimeline(plan.steps, { hrZones, powerZones });
    }
    this.state = createSession({ timeline, workoutName: plan ? plan.name : null, sport });
    this.sport = sport;
    await dbRun(`UPDATE live_sessions SET plan_id = ?, workout_name = ?, sport = ?, status = 'active', first_point_at = COALESCE(first_point_at, ?) WHERE id = ?`, [
      plan ? plan.id : null,
      plan ? plan.name : null,
      sport,
      firstPoint.dateTime,
      this.row.id,
    ]);
  }

  async send(cue) {
    const { title, body } = renderCue(this.lang, cue, { sport: this.sport });
    this.cues.push({ at: new Date(cue.atMs).toISOString(), sentAt: new Date().toISOString(), type: cue.type, body });
    try {
      await sendPushToUser(this.row.user_id, { title, body, data: { url: "/(tabs)/coach" } });
    } catch (e) {
      console.error(`[live ${this.row.id}] push failed:`, e.message);
    }
  }

  async tick() {
    if (this.stopped) return;
    let points;
    try {
      points = await this.client.getTrackPoints(this.lastMs ? new Date(this.lastMs).toISOString() : null);
      this.errors = 0;
    } catch (e) {
      this.errors++;
      if (this.errors >= MAX_CONSECUTIVE_ERRORS) return this.finish("error", e.message);
      return this.schedule(POLL_MS);
    }

    const fresh = points.filter((p) => Date.parse(p.dateTime) > this.lastMs);
    const now = Date.now();
    if (fresh.length) {
      if (!this.state) await this.initState(fresh[0]);
      // After a restart, replay what was missed without sending, then carry on with
      // the cue history from before so the budget and gaps still hold.
      const replay = this.resume;
      if (replay) this.state.silent = true;
      for (const p of fresh) {
        const cues = processPoint(this.state, p);
        for (const cue of cues) await this.send(cue);
      }
      if (replay) {
        this.state.silent = false;
        this.state.sent = this.cues.map((c) => ({ atMs: Date.parse(c.at), type: c.type }));
        this.resume = false;
      }
      this.lastMs = Date.parse(fresh[fresh.length - 1].dateTime);
      this.lastArrivalMs = now;
      await dbRun(`UPDATE live_sessions SET last_point_at = ?, last_metrics_json = ?, cues_json = ? WHERE id = ?`, [
        fresh[fresh.length - 1].dateTime,
        JSON.stringify(metricsOf(fresh[fresh.length - 1])),
        JSON.stringify(this.cues),
        this.row.id,
      ]);
      if (fresh.some((p) => (p.eventTypes || []).includes("END"))) return this.finish("ended");
    } else if (!this.state && now - this.createdMs > FIRST_POINT_WAIT_MS) {
      return this.finish("ended", "no GPS points arrived");
    } else if (this.state && now - this.lastArrivalMs > NO_POINTS_END_MS) {
      return this.finish("ended");
    }
    this.schedule(POLL_MS);
  }

  async finish(status, error = null) {
    this.stopped = true;
    clearTimeout(this.timer);
    runners.delete(this.row.id);
    const summary = this.state ? summarize(this.state) : null;
    await dbRun(
      `UPDATE live_sessions SET status = ?, error = ?, ended_at = CURRENT_TIMESTAMP, token = NULL, summary_json = ?, cues_json = ? WHERE id = ?`,
      [status, error, summary ? JSON.stringify(summary) : null, JSON.stringify(this.cues), this.row.id],
    ).catch((e) => console.error(`[live ${this.row.id}] finish failed:`, e.message));
    console.log(`[live ${this.row.id}] ${status}${error ? `: ${error}` : ""} (${this.cues.length} cues)`);
  }
}

/**
 * Start coaching a LiveTrack link for a user.
 * `source` is 'email' (inbound address) or 'admin' (pasted for testing). Email sessions
 * must come from the Garmin profile that first used this athlete's address.
 * Returns the live_sessions row.
 */
async function startLiveSession({ userId, url, source }) {
  const link = parseLiveTrackUrl(url);
  if (!link) throw Object.assign(new Error("No LiveTrack link found"), { status: 400 });

  const existing = await dbGet(`SELECT * FROM live_sessions WHERE garmin_session_id = ?`, [link.sessionId]);
  if (existing) return existing;

  const client = new LiveTrackClient(link);
  const info = await client.getSession();
  if (!info || !info.viewable) throw Object.assign(new Error("LiveTrack session is not viewable"), { status: 422 });
  if (info.end && Date.parse(info.end) < Date.now()) throw Object.assign(new Error("LiveTrack session has already ended"), { status: 422 });

  const profileId = info.publisher && info.publisher.connectUserProfileId;
  if (source === "email") {
    const user = await dbGet(`SELECT garmin_profile_id FROM users WHERE id = ?`, [userId]);
    if (user && user.garmin_profile_id && profileId && Number(user.garmin_profile_id) !== Number(profileId)) {
      throw Object.assign(new Error("LiveTrack session is from a different Garmin account"), { status: 403 });
    }
    if (user && !user.garmin_profile_id && profileId) {
      await dbRun(`UPDATE users SET garmin_profile_id = ? WHERE id = ?`, [profileId, userId]);
    }
  }

  const ins = await dbRun(
    `INSERT INTO live_sessions (user_id, garmin_session_id, token, source, status, publisher_profile_id) VALUES (?, ?, ?, ?, 'waiting', ?)`,
    [userId, link.sessionId, link.token, source, profileId || null],
  );
  const row = await dbGet(`SELECT * FROM live_sessions WHERE id = ?`, [ins.lastID]);
  const runner = new Runner(row);
  runner.client = client; // already authenticated
  runners.set(row.id, runner);
  runner.start();
  console.log(`[live ${row.id}] started for user ${userId} (${source})`);
  return row;
}

async function stopLiveSession(id) {
  const runner = runners.get(Number(id));
  if (runner) return runner.finish("stopped");
  await dbRun(`UPDATE live_sessions SET status = 'stopped', token = NULL, ended_at = COALESCE(ended_at, CURRENT_TIMESTAMP) WHERE id = ? AND status IN ('waiting','active')`, [id]);
}

/** Pick up sessions that were running when the server restarted. */
async function resumeLiveSessions() {
  const rows = await dbAll(`SELECT * FROM live_sessions WHERE status IN ('waiting','active') AND token IS NOT NULL`);
  for (const row of rows) {
    const lastMs = Date.parse(row.last_point_at || "") || Date.parse(`${row.created_at}Z`) || 0;
    if (Date.now() - lastMs > FIRST_POINT_WAIT_MS) {
      await dbRun(`UPDATE live_sessions SET status = 'ended', token = NULL, ended_at = CURRENT_TIMESTAMP, error = 'not resumed after restart' WHERE id = ?`, [row.id]);
      continue;
    }
    const runner = new Runner(row, { resume: true });
    runners.set(row.id, runner);
    runner.start();
    console.log(`[live ${row.id}] resumed after restart`);
  }
}

async function listLiveSessions(limit = 50) {
  const rows = await dbAll(
    `SELECT ls.id, ls.user_id, u.username, ls.source, ls.status, ls.workout_name, ls.sport, ls.created_at, ls.first_point_at,
            ls.last_point_at, ls.ended_at, ls.last_metrics_json, ls.cues_json, ls.summary_json, ls.error
       FROM live_sessions ls LEFT JOIN users u ON u.id = ls.user_id
      ORDER BY ls.id DESC LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({
    ...r,
    last_metrics: r.last_metrics_json ? JSON.parse(r.last_metrics_json) : null,
    cues: JSON.parse(r.cues_json || "[]"),
    summary: r.summary_json ? JSON.parse(r.summary_json) : null,
    last_metrics_json: undefined,
    cues_json: undefined,
    summary_json: undefined,
  }));
}

/** Finished live sessions from the last `days`, for the coach to refer to. */
async function recentLiveSummaries(userId, days = 2) {
  const rows = await dbAll(
    `SELECT workout_name, sport, ended_at, summary_json, cues_json FROM live_sessions
      WHERE user_id = ? AND status = 'ended' AND summary_json IS NOT NULL AND ended_at >= datetime('now', ?)
      ORDER BY id DESC`,
    [userId, `-${days} days`],
  );
  return rows.map((r) => ({
    workoutName: r.workout_name,
    sport: r.sport,
    endedAt: r.ended_at,
    summary: JSON.parse(r.summary_json),
    cues: JSON.parse(r.cues_json || "[]").map((c) => c.body),
  }));
}

module.exports = {
  startLiveSession,
  stopLiveSession,
  resumeLiveSessions,
  listLiveSessions,
  recentLiveSummaries,
  sportFromActivityType,
};
