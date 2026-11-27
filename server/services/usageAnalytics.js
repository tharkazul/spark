// Usage analytics: which screens and buttons athletes use, first party only.
// Plan and privacy reasoning: docs/usage-analytics-plan.md.
//
// Raw events (app_events) are kept RAW_DAYS and then deleted. Every chart in the admin
// page reads summary tables instead, which are never deleted:
//   app_event_rollup      counts per day and per week, per event and per property value
//   app_cohort_funnel     per sign-up week, how many athletes reached each onboarding step
//   app_cohort_retention  per sign-up week, how many were active N weeks later
// A period is only (re)computed while all of its raw events still exist (start no older
// than FREEZE_DAYS); after that its summary rows are final.

const db = require("./db");

const RAW_DAYS = 90;
const FREEZE_DAYS = 85;
const FUNNEL_WINDOW_DAYS = 28;
const RETENTION_WEEKS = 12;
const MAX_EVENTS_PER_REQUEST = 200;

const TABS = ["planning", "progress", "coach", "social", "profile"];
const SUBTABS = [
  "overview", "fitness", "body", "history", // progress
  "feed", "leaderboard", "my_log", // social
  "profile", "training", "coach", "connections", // profile
];
const SERVICES = ["garmin", "strava", "apple_health", "suunto", "trainerday"];
const SPORTS = ["run", "bike", "swim", "strength", "walk", "hike", "rest", "other"];
const METHODS = ["email", "apple", "google"];
const PAYWALL_FROM = ["tab_bar", "planning", "coach", "out_of_messages", "profile", "account", "connections", "my_log", "other"];
const BOOL = "bool";

/**
 * Every event the app may send. `props` lists the allowed properties: an array of fixed
 * values, BOOL, or { int: [min, max] }. `dims` are the property combinations the
 * summaries are broken down by (the total is always kept). Anything not listed here is
 * dropped: unknown events entirely, unknown properties or values individually.
 */
const EVENTS = {
  app_opened: { props: { cold: BOOL }, dims: [["cold"]] },
  session_ended: { props: { seconds: { int: [0, 86400] } } },
  tab_viewed: { props: { tab: TABS, via: ["tap", "swipe"] }, dims: [["tab"], ["via"]] },
  subtab_viewed: { props: { tab: TABS, subtab: SUBTABS }, dims: [["tab", "subtab"]] },
  screen_viewed: { props: { screen: ["activities", "activity_detail", "athlete_profile"] }, dims: [["screen"]] },
  push_opened: { props: { type: ["morning", "coach", "analysis", "plan", "social", "race_day", "other"] }, dims: [["type"]] },

  login_viewed: { props: {} },
  signup_started: { props: { method: METHODS }, dims: [["method"]] },
  signup_completed: { props: { method: METHODS }, dims: [["method"]] },
  login_completed: { props: { method: METHODS }, dims: [["method"]] },
  onboarding_step_viewed: { props: { step: ["welcome", "language", "coach_style", "coach_gender", "goal"] }, dims: [["step"]] },
  onboarding_completed: { props: { seconds: { int: [0, 86400] } } },
  ai_consent_shown: { props: { where: ["onboarding", "coach", "shortcut", "settings"] }, dims: [["where"]] },
  ai_consent_answered: { props: { answer: ["allow", "not_now", "off"], where: ["onboarding", "coach", "shortcut", "settings"] }, dims: [["answer"], ["where", "answer"]] },
  notifications_answered: { props: { granted: BOOL }, dims: [["granted"]] },
  integration_connect_started: { props: { service: SERVICES }, dims: [["service"]] },
  integration_connected: { props: { service: SERVICES }, dims: [["service"]] },
  integration_failed: { props: { service: SERVICES }, dims: [["service"]] },
  integration_disconnected: { props: { service: SERVICES }, dims: [["service"]] },

  workout_opened: { props: { sport: SPORTS, from: ["today_card", "agenda", "week_bar", "other"] }, dims: [["sport"], ["from"]] },
  why_this_workout_opened: { props: {} },
  adapt_opened: { props: {} },
  adapt_submitted: { props: {} },
  plan_shifted: { props: { days: { int: [-7, 7] } }, dims: [["days"]] },
  workout_added: { props: { sport: SPORTS, how: ["manual", "quick_build"] }, dims: [["sport"], ["how"]] },
  workout_sent_to_device: { props: { target: ["garmin", "suunto", "apple_watch", "trainerday"] }, dims: [["target"]] },
  activity_logged_manually: { props: { sport: SPORTS }, dims: [["sport"]] },
  partner_invited: { props: {} },

  coach_message_sent: { props: { kind: ["text", "voice", "photo"] }, dims: [["kind"]] },
  proposal_answered: { props: { answer: ["accept", "reject"] }, dims: [["answer"]] },
  out_of_messages_shown: { props: {} },
  app_update_reloaded: { props: {} },

  paywall_shown: { props: { from: PAYWALL_FROM }, dims: [["from"]] },
  paywall_closed: {
    props: { from: PAYWALL_FROM, result: ["purchased", "restored", "cancelled", "error", "not_presented"] },
    dims: [["result"], ["from", "result"]],
  },
  discount_code_tried: { props: { valid: BOOL }, dims: [["valid"]] },

  friend_request_sent: { props: {} },
  kudos_given: { props: {} },
  setting_changed: {
    props: {
      setting: ["coach_style", "coach_gender", "language", "dark_mode", "units", "usage_stats", "morning_time"],
      value: ["en", "nl", "de", "es", "fr", "pt", "on", "off", "metric", "imperial"],
    },
    dims: [["setting"], ["setting", "value"]],
  },
};

// The '*' rows: any event at all, which is what "active" means in the charts.
const ANY_DIMS = [["platform"], ["app_version"]];

// ---------------------------------------------------------------------------
// Small promise helpers

const run = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    }),
  );
const all = (sql, params = []) =>
  new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || []))));
const get = (sql, params = []) =>
  new Promise((resolve, reject) => db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));

// ---------------------------------------------------------------------------
// Dates. Days are Amsterdam calendar days ("YYYY-MM-DD"), weeks start on Monday.

const amsDay = (date = new Date()) => new Date(date).toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });
const addDays = (day, n) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekStart = (day) => {
  const d = new Date(`${day}T12:00:00Z`);
  return addDays(day, -((d.getUTCDay() + 6) % 7));
};
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
// users.created_at is SQLite's CURRENT_TIMESTAMP: UTC without a zone marker.
const signupDay = (createdAt) => {
  if (!createdAt) return null;
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(createdAt) ? createdAt : `${String(createdAt).replace(" ", "T")}Z`;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? amsDay(t) : null;
};

// ---------------------------------------------------------------------------
// Receiving events

function normalizeSport(value) {
  const s = String(value || "").toLowerCase();
  if (/run|jog|treadmill/.test(s)) return "run";
  if (/ride|bike|cycl|spin/.test(s)) return "bike";
  if (/swim/.test(s)) return "swim";
  if (/strength|gym|weight|crossfit|core|mobility|yoga|pilates/.test(s)) return "strength";
  if (/walk/.test(s)) return "walk";
  if (/hike/.test(s)) return "hike";
  if (/rest/.test(s)) return "rest";
  return "other";
}

/** The event as stored, or null when its name isn't on the list. Unknown properties are dropped. */
function sanitizeEvent(raw) {
  if (!raw || typeof raw.name !== "string") return null;
  const spec = EVENTS[raw.name];
  if (!spec) return null;
  const props = {};
  const input = raw.props && typeof raw.props === "object" ? raw.props : {};
  for (const [key, rule] of Object.entries(spec.props)) {
    let value = input[key];
    if (value === undefined || value === null) continue;
    if (rule === BOOL) {
      if (typeof value === "boolean") props[key] = value ? "yes" : "no";
      continue;
    }
    if (Array.isArray(rule)) {
      if (rule === SPORTS) value = normalizeSport(value);
      value = String(value);
      if (rule.includes(value)) props[key] = value;
      continue;
    }
    if (rule && rule.int) {
      const n = Math.round(Number(value));
      if (Number.isFinite(n) && n >= rule.int[0] && n <= rule.int[1]) props[key] = n;
    }
  }
  return { name: raw.name, props };
}

const cleanText = (value, max) => (typeof value === "string" ? value.replace(/[^\w.() -]/g, "").slice(0, max) : null);

/**
 * Stores a batch from the app. userId is null before login. Nothing is stored for an
 * athlete who turned usage statistics off, or for an account that no longer exists.
 * Resolves to the number of events stored.
 */
async function recordEvents(userId, body) {
  const events = Array.isArray(body?.events) ? body.events.slice(0, MAX_EVENTS_PER_REQUEST) : [];
  const sessionId = cleanText(body?.session_id, 64);
  if (!events.length || !sessionId) return 0;

  if (userId) {
    const user = await get(`SELECT usage_stats_enabled, deleted_at FROM users WHERE id = ?`, [userId]);
    if (!user || user.deleted_at || Number(user.usage_stats_enabled) === 0) return 0;
  }

  const platform = ["ios", "android", "web"].includes(body?.platform) ? body.platform : "other";
  const appVersion = cleanText(body?.app_version, 32);
  const updateId = cleanText(body?.update_id, 64);
  const day = amsDay();

  const clean = events.map(sanitizeEvent).filter(Boolean);
  if (!clean.length) return 0;

  await run("BEGIN");
  try {
    for (const e of clean) {
      await run(
        `INSERT INTO app_events (user_id, session_id, name, props_json, platform, app_version, update_id, day) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId || null, sessionId, e.name, JSON.stringify(e.props), platform, appVersion, updateId, day],
      );
    }
    await run("COMMIT");
  } catch (err) {
    await run("ROLLBACK").catch(() => {});
    throw err;
  }
  const since = await get(`SELECT value FROM app_analytics_meta WHERE key = 'collecting_since'`);
  if (!since) await run(`INSERT OR IGNORE INTO app_analytics_meta (key, value) VALUES ('collecting_since', ?)`, [day]);
  return clean.length;
}

/** Turning usage statistics off also deletes what was recorded (privacy policy, section 9). */
async function setUsageStatsEnabled(userId, enabled) {
  await run(`UPDATE users SET usage_stats_enabled = ? WHERE id = ?`, [enabled ? 1 : 0, userId]);
  if (!enabled) await run(`DELETE FROM app_events WHERE user_id = ?`, [userId]);
}

// ---------------------------------------------------------------------------
// Summaries

// Accounts marked as test accounts in the admin page are left out of every summary.
// Events from before sign-up (user_id NULL) still count.
const REAL_USERS = `(user_id IS NULL OR user_id NOT IN (SELECT id FROM users WHERE COALESCE(is_test_account, 0) = 1))`;
const dimExpr = (dim) => dim.map((p) => `COALESCE(json_extract(props_json, '$.${p}'), '')`).join(` || '|' || `);
const ANY_DIM_COLUMN = { platform: "platform", app_version: "COALESCE(app_version, '')" };

async function rollupPeriod(period, start, end) {
  const range = [start, end];
  const rows = [];
  const push = (name, dim, r) =>
    rows.push([period, start, name, dim, r.dim_value ?? "", r.events, r.users, r.sessions]);

  const counts = `COUNT(*) AS events, COUNT(DISTINCT user_id) AS users, COUNT(DISTINCT session_id) AS sessions`;
  const anyTotal = await get(`SELECT ${counts} FROM app_events WHERE day BETWEEN ? AND ? AND ${REAL_USERS}`, range);
  if (anyTotal && anyTotal.events) push("*", "", anyTotal);
  for (const [dimName] of ANY_DIMS) {
    const col = ANY_DIM_COLUMN[dimName];
    for (const r of await all(`SELECT ${col} AS dim_value, ${counts} FROM app_events WHERE day BETWEEN ? AND ? AND ${REAL_USERS} GROUP BY 1`, range)) push("*", dimName, r);
  }
  for (const r of await all(`SELECT name, ${counts} FROM app_events WHERE day BETWEEN ? AND ? AND ${REAL_USERS} GROUP BY name`, range)) push(r.name, "", r);
  for (const [name, spec] of Object.entries(EVENTS)) {
    for (const dim of spec.dims || []) {
      const found = await all(
        `SELECT ${dimExpr(dim)} AS dim_value, ${counts} FROM app_events WHERE day BETWEEN ? AND ? AND ${REAL_USERS} AND name = ? GROUP BY 1`,
        [...range, name],
      );
      for (const r of found) push(name, dim.join(","), r);
    }
  }

  await run("BEGIN");
  try {
    await run(`DELETE FROM app_event_rollup WHERE period = ? AND period_start = ?`, [period, start]);
    for (const r of rows) {
      await run(
        `INSERT INTO app_event_rollup (period, period_start, name, dim, dim_value, events, users, sessions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        r,
      );
    }
    await run("COMMIT");
  } catch (err) {
    await run("ROLLBACK").catch(() => {});
    throw err;
  }
}

const FUNNEL_STEPS = [
  "signed_up",
  "opened_app",
  "onboarding_welcome",
  "onboarding_language",
  "onboarding_coach_style",
  "onboarding_coach_gender",
  "onboarding_goal",
  "onboarding_completed",
  "ai_allowed",
  "device_connected",
  "first_coach_message",
  "back_after_a_week",
];

/** Which funnel steps one athlete reached, from their events within the funnel window. */
function stepsReached(events, signup) {
  const reached = new Set(["signed_up"]);
  for (const e of events) {
    const age = daysBetween(signup, e.day);
    if (age < 0) continue;
    if (age >= 7 && age <= 13) reached.add("back_after_a_week");
    if (age >= FUNNEL_WINDOW_DAYS) continue;
    reached.add("opened_app");
    const props = JSON.parse(e.props_json || "{}");
    if (e.name === "onboarding_step_viewed" && props.step) reached.add(`onboarding_${props.step}`);
    if (e.name === "onboarding_completed") reached.add("onboarding_completed");
    if (e.name === "ai_consent_answered" && props.answer === "allow") reached.add("ai_allowed");
    if (e.name === "integration_connected") reached.add("device_connected");
    if (e.name === "coach_message_sent") reached.add("first_coach_message");
  }
  return reached;
}

async function rollupCohorts(today) {
  const meta = await get(`SELECT value FROM app_analytics_meta WHERE key = 'collecting_since'`);
  if (!meta) return;
  const firstWeek = weekStart(meta.value);
  const freezeDay = addDays(today, -FREEZE_DAYS);

  const users = await all(
    `SELECT id, created_at FROM users WHERE deleted_at IS NULL AND COALESCE(usage_stats_enabled, 1) = 1 AND COALESCE(is_test_account, 0) = 0`,
  );
  const cohorts = new Map();
  for (const u of users) {
    const day = signupDay(u.created_at);
    if (!day) continue;
    const week = weekStart(day);
    if (week < firstWeek || week > today) continue;
    if (!cohorts.has(week)) cohorts.set(week, []);
    cohorts.get(week).push({ id: u.id, signup: day });
  }

  for (const [week, members] of cohorts) {
    // Oldest raw event a row for this cohort could need: the funnel needs the cohort's
    // first day onwards, a retention week its own first day onwards.
    const ids = members.map((m) => m.id);
    const placeholders = ids.map(() => "?").join(",");
    const events = await all(
      `SELECT user_id, name, props_json, day FROM app_events WHERE user_id IN (${placeholders})`,
      ids,
    );
    const byUser = new Map(ids.map((id) => [id, []]));
    for (const e of events) byUser.get(e.user_id)?.push(e);

    if (week >= freezeDay) {
      const counts = Object.fromEntries(FUNNEL_STEPS.map((s) => [s, 0]));
      for (const m of members) for (const s of stepsReached(byUser.get(m.id), m.signup)) if (s in counts) counts[s] += 1;
      for (const step of FUNNEL_STEPS) {
        await run(`INSERT OR REPLACE INTO app_cohort_funnel (cohort_week, step, users) VALUES (?, ?, ?)`, [week, step, counts[step]]);
      }
    }

    for (let k = 0; k <= RETENTION_WEEKS; k++) {
      const windowStart = addDays(week, 7 * k);
      if (windowStart > today) break;
      if (windowStart < freezeDay) continue;
      let active = 0;
      let complete = true;
      for (const m of members) {
        const from = addDays(m.signup, 7 * k);
        const to = addDays(from, 6);
        if (to >= today) complete = false;
        if (byUser.get(m.id).some((e) => e.day >= from && e.day <= to)) active += 1;
      }
      await run(
        `INSERT OR REPLACE INTO app_cohort_retention (cohort_week, week_offset, cohort_size, active_users, complete) VALUES (?, ?, ?, ?, ?)`,
        [week, k, members.length, active, complete ? 1 : 0],
      );
    }
  }
}

/**
 * Recomputes the summaries for the last `days` days (at most FREEZE_DAYS) and the weeks
 * they fall in, then the cohorts, then deletes raw events older than RAW_DAYS.
 */
// Rollups run one at a time: each period is rewritten inside a transaction on the shared
// connection, and the hourly job can overlap with one started from the admin page.
let rollupQueue = Promise.resolve();
function runRollup(options) {
  const next = rollupQueue.then(() => runRollupNow(options));
  rollupQueue = next.catch(() => {});
  return next;
}

async function runRollupNow({ days = FREEZE_DAYS, now = new Date() } = {}) {
  const today = amsDay(now);
  const span = Math.min(days, FREEZE_DAYS);
  const from = addDays(today, -span);
  for (let d = from; d <= today; d = addDays(d, 1)) await rollupPeriod("day", d, d);
  const firstWeek = weekStart(from) < addDays(today, -FREEZE_DAYS) ? addDays(weekStart(from), 7) : weekStart(from);
  for (let w = firstWeek; w <= today; w = addDays(w, 7)) await rollupPeriod("week", w, addDays(w, 6));
  await rollupCohorts(today);
  const purged = await run(`DELETE FROM app_events WHERE day < ?`, [addDays(today, -RAW_DAYS)]);
  return { today, days: span, purged: purged.changes || 0 };
}

// ---------------------------------------------------------------------------
// Admin page

async function overview({ days = 90, now = new Date() } = {}) {
  const today = amsDay(now);
  const from = addDays(today, -(days - 1));
  const fromWeek = weekStart(from);
  const meta = await get(`SELECT value FROM app_analytics_meta WHERE key = 'collecting_since'`);

  const daily = await all(
    `SELECT period_start AS day, users, sessions, events FROM app_event_rollup WHERE period = 'day' AND name = '*' AND dim = '' AND period_start >= ? ORDER BY period_start`,
    [from],
  );
  const weekly = await all(
    `SELECT period_start AS week, users, sessions, events FROM app_event_rollup WHERE period = 'week' AND name = '*' AND dim = '' AND period_start >= ? ORDER BY period_start`,
    [fromWeek],
  );

  const funnelRows = await all(
    `SELECT step, SUM(users) AS users FROM app_cohort_funnel WHERE cohort_week >= ? GROUP BY step`,
    [fromWeek],
  );
  const funnelMap = Object.fromEntries(funnelRows.map((r) => [r.step, r.users]));
  const funnel = FUNNEL_STEPS.map((step) => ({ step, users: funnelMap[step] || 0 }));

  const sumBy = async (name, dim, period = "day") =>
    all(
      `SELECT dim_value, SUM(events) AS events, SUM(users) AS users, SUM(sessions) AS sessions FROM app_event_rollup
        WHERE period = ? AND name = ? AND dim = ? AND period_start >= ? GROUP BY dim_value`,
      [period, name, dim, period === "day" ? from : fromWeek],
    );
  const sessionsOf = async (name) => (await sumBy(name, ""))[0]?.sessions || 0;
  const signupFunnel = [
    { step: "login_viewed", sessions: await sessionsOf("login_viewed") },
    { step: "signup_started", sessions: await sessionsOf("signup_started") },
    { step: "signup_completed", sessions: await sessionsOf("signup_completed") },
  ];

  const retentionRows = await all(
    `SELECT cohort_week, week_offset, cohort_size, active_users, complete FROM app_cohort_retention WHERE cohort_week >= ? ORDER BY cohort_week, week_offset`,
    [fromWeek],
  );
  const retention = [];
  for (const r of retentionRows) {
    let c = retention[retention.length - 1];
    if (!c || c.cohort_week !== r.cohort_week) {
      c = { cohort_week: r.cohort_week, size: r.cohort_size, weeks: [] };
      retention.push(c);
    }
    c.weeks[r.week_offset] = { active: r.active_users, complete: !!r.complete };
  }

  // Feature use: per week, the share of that week's active athletes who did it.
  const weeklyUsers = Object.fromEntries(weekly.map((w) => [w.week, w.users]));
  const tabRows = await all(
    `SELECT period_start AS week, dim_value AS tab, users FROM app_event_rollup WHERE period = 'week' AND name = 'tab_viewed' AND dim = 'tab' AND period_start >= ?`,
    [fromWeek],
  );
  const tabs = TABS.map((tab) => {
    const rows = tabRows.filter((r) => r.tab === tab && weeklyUsers[r.week]);
    const share = rows.length ? rows.reduce((s, r) => s + r.users / weeklyUsers[r.week], 0) / weekly.length : 0;
    return { tab, share };
  });

  const eventRows = await all(
    `SELECT name, SUM(events) AS events FROM app_event_rollup WHERE period = 'day' AND dim = '' AND name != '*' AND period_start >= ? GROUP BY name`,
    [from],
  );
  const weeklyEventUsers = await all(
    `SELECT name, period_start AS week, users FROM app_event_rollup WHERE period = 'week' AND dim = '' AND name != '*' AND period_start >= ?`,
    [fromWeek],
  );
  const events = eventRows
    .map((r) => {
      const weeks = weeklyEventUsers.filter((w) => w.name === r.name && weeklyUsers[w.week]);
      const share = weekly.length ? weeks.reduce((s, w) => s + w.users / weeklyUsers[w.week], 0) / weekly.length : 0;
      return { name: r.name, events: r.events, weekly_share: share };
    })
    .sort((a, b) => b.events - a.events);

  const shown = await sumBy("paywall_shown", "from");
  const closed = await sumBy("paywall_closed", "from,result");
  const paywall = PAYWALL_FROM.map((src) => {
    const of = (result) => closed.filter((r) => r.dim_value === `${src}|${result}`).reduce((s, r) => s + r.events, 0);
    return {
      from: src,
      shown: shown.find((r) => r.dim_value === src)?.events || 0,
      purchased: of("purchased"),
      restored: of("restored"),
      cancelled: of("cancelled"),
    };
  }).filter((p) => p.shown || p.purchased || p.restored);

  return {
    today,
    days,
    collecting_since: meta?.value || null,
    raw_days: RAW_DAYS,
    daily,
    weekly,
    funnel,
    signup_funnel: signupFunnel,
    retention,
    tabs,
    events,
    paywall,
    event_names: Object.keys(EVENTS),
    event_dims: Object.fromEntries(Object.entries(EVENTS).map(([n, s]) => [n, (s.dims || []).map((d) => d.join(","))])),
  };
}

/** One event per day, broken down by one of its dims ('' for the total). */
async function eventSeries({ name, dim = "", days = 90, now = new Date() }) {
  if (name !== "*" && !EVENTS[name]) return null;
  const from = addDays(amsDay(now), -(days - 1));
  const rows = await all(
    `SELECT period_start AS day, dim_value, events, users FROM app_event_rollup WHERE period = 'day' AND name = ? AND dim = ? AND period_start >= ? ORDER BY period_start`,
    [name, dim, from],
  );
  return { name, dim, from, rows };
}

module.exports = {
  EVENTS,
  FUNNEL_STEPS,
  RAW_DAYS,
  FREEZE_DAYS,
  sanitizeEvent,
  recordEvents,
  setUsageStatsEnabled,
  runRollup,
  overview,
  eventSeries,
  _internal: { amsDay, addDays, weekStart, signupDay, stepsReached },
};
