/**
 * Detail that grows over time.
 *
 * New athletes get plain sessions ("40 min easy, you should be able to chat").
 * Deeper topics (drills, cadence, fuelling grams, breathing) are introduced one
 * at a time, at most one new topic a week, when the training actually calls for
 * it. Topics the athlete has seen may be referred to briefly afterwards.
 *
 * The catalogue lives in the coaching_topics table (seeded from CATALOGUE below
 * on startup, so it can be tuned in the database), and athlete_topics records
 * which topics each athlete has been introduced to. users.detail_level lets the
 * athlete choose short / normal / deep.
 */
const db = require("./db");

const dbAll = (sql, params = []) => new Promise((resolve) => db.all(sql, params, (err, rows) => resolve(err || !rows ? [] : rows)));
const dbGet = (sql, params = []) => new Promise((resolve) => db.get(sql, params, (err, row) => resolve(err ? null : row || null)));
const dbRun = (sql, params = []) => new Promise((resolve) => db.run(sql, params, () => resolve()));

// Order = priority when several topics are eligible in the same week.
// disciplines: running | triathlon | hyrox | general | all
const CATALOGUE = [
  { key: "taper", disciplines: "all", hint: "Why training less in the taper makes the athlete faster on race day, and that feeling restless or sluggish is normal." },
  { key: "checkpoint", disciplines: "all", hint: "How to pace this week's benchmark retest (start controlled, finish strongest) and what the result tells us." },
  { key: "recovery_week", disciplines: "all", hint: "Why a lighter week makes the athlete fitter: the body adapts during recovery, not during the hard sessions." },
  { key: "easy_effort", disciplines: "all", hint: "What 'easy' really means: conversational, able to talk in full sentences, slower than feels natural." },
  { key: "zones", disciplines: "all", hint: "Heart-rate zones in plain words: zone 2 is easy and builds the engine; most training is easy so the hard sessions can be hard." },
  { key: "long_session_pacing", disciplines: "all", hint: "Pacing the long session: start slower than feels right and keep it steady; it should feel easy for the first half." },
  { key: "fueling_basics", disciplines: "all", hint: "Eating and drinking during sessions over ~75 minutes: start early, about 30-60 g of carbohydrate per hour and a few sips of fluid every 15 minutes." },
  { key: "strides", disciplines: "running,triathlon", hint: "Strides: 4-6 relaxed accelerations of 15-20 seconds after an easy run, to stay smooth and quick without extra fatigue." },
  { key: "threshold", disciplines: "all", hint: "Threshold effort: comfortably hard, the effort you could hold for about an hour; it is the key quality session of the build." },
  { key: "brick", disciplines: "triathlon", hint: "Brick sessions: running straight off the bike so the legs learn the transition; the first minutes feel heavy and that is normal." },
  { key: "compromised_running", disciplines: "hyrox", hint: "Compromised running: running on tired legs straight after a station, and settling into rhythm within the first 200 m." },
  { key: "drills", disciplines: "running,triathlon", hint: "Running drills (A-skips, high knees, butt kicks): 5 minutes before quality runs, for a lighter, more efficient stride." },
  { key: "cadence", disciplines: "running,triathlon", hint: "Cadence: slightly shorter, quicker steps reduce impact; small changes (+5%), no magic number." },
  { key: "race_fueling", disciplines: "all", hint: "Practising race-day fuelling in long sessions: the same products and timing as on race day, so the gut is trained too." },
  { key: "breathing", disciplines: "all", hint: "Breathing rhythm under effort: relaxed belly breathing, and matching breath to steps or strokes when it gets hard." },
  { key: "open_water", disciplines: "triathlon", hint: "Open water: sighting every 6-10 strokes, wetsuit practice, and a calm start at the side or back of the group." },
];

db.serialize(() => {
  db.run(`ALTER TABLE users ADD COLUMN detail_level TEXT DEFAULT 'short'`, () => {});
  db.run(`CREATE TABLE IF NOT EXISTS coaching_topics (
    key TEXT PRIMARY KEY,
    disciplines TEXT NOT NULL,
    hint TEXT NOT NULL,
    priority INTEGER NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS athlete_topics (
    user_id INTEGER NOT NULL,
    topic_key TEXT NOT NULL,
    introduced_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, topic_key)
  )`);
  CATALOGUE.forEach((t, i) => {
    db.run(`INSERT OR IGNORE INTO coaching_topics (key, disciplines, hint, priority) VALUES (?, ?, ?, ?)`, [t.key, t.disciplines, t.hint, i]);
  });
});

/**
 * Which new topic (if any) fits this week. `week` is the season_weeks row for
 * the week being planned (or null without a race), `planWeek` its 1-based index.
 */
function eligibleTopics({ week, discipline, known, longestMinutes }) {
  const has = (k) => known.has(k);
  const phase = week ? week.phase : null;
  const planWeek = week ? week.week_index : 1;
  const rules = {
    taper: phase === "taper",
    checkpoint: Boolean(week && week.is_checkpoint),
    recovery_week: Boolean(week && week.is_recovery),
    easy_effort: true,
    zones: has("easy_effort"),
    long_session_pacing: longestMinutes >= 60,
    fueling_basics: longestMinutes >= 75,
    strides: planWeek >= 3,
    threshold: phase === "build" || phase === "peak",
    brick: phase === "build" || phase === "peak",
    compromised_running: phase === "build" || phase === "peak",
    drills: planWeek >= 5 && has("strides"),
    cadence: has("drills") && (phase === "build" || phase === "peak"),
    race_fueling: has("fueling_basics") && (phase === "peak" || phase === "taper"),
    breathing: has("threshold") && phase === "peak",
    open_water: phase === "peak",
  };
  return (t) => {
    const allowed = t.disciplines === "all" || t.disciplines.split(",").includes(discipline);
    return allowed && !has(t.key) && rules[t.key] === true;
  };
}

/** Longest planned session this week in minutes, from the season's long sessions. */
function longestMinutesOf(week, easyPace = 6.5) {
  if (!week) return 0;
  let longs = [];
  try {
    longs = JSON.parse(week.long_sessions_json || "[]");
  } catch (_) {}
  return longs.reduce((m, l) => Math.max(m, l.unit === "km" ? l.value * easyPace : l.value), 0);
}

// Workout titles follow the same setting: a SHORT athlete wants "Intervals", not
// "Neuromuscular Spin-Ups". Used by the weekly planner, coach chat and Adapt.
const TITLE_RULES = {
  short: `WORKOUT TITLES ("description"): plain words any amateur understands, 2-4 words, e.g. "Easy run", "Intervals", "Long ride", "Technique swim", "Strength: legs & core", "Recovery spin". No jargon: not neuromuscular, VO2max, threshold, CSS, EVF, aerobic base, activation, spin-ups, sweet spot or zone numbers. No minutes in the title; the app shows the duration.`,
  normal: `WORKOUT TITLES ("description"): short and clear, 2-5 words. One common training word is fine (tempo, threshold, hill repeats, strides), never a stack of them, e.g. "Tempo run", "Threshold intervals", "Long ride with hills". No minutes in the title; the app shows the duration.`,
  deep: `WORKOUT TITLES ("description"): precise training terms are welcome (e.g. "CSS intervals", "VO2max 5 x 3 min", "Strides & drills"), under 6 words. No minutes in the title; the app shows the duration.`,
};

/** The title rule for an athlete's detail level (short when unset). */
function titleRuleFor(level) {
  return TITLE_RULES[level] || TITLE_RULES.short;
}

const LEVEL_RULES = {
  short: `DETAIL LEVEL: SHORT (the athlete's choice, or the default for new athletes).
- ${TITLE_RULES.short}
- "details": at most 2 short sentences in plain words: the purpose and one effort cue (e.g. "easy enough to chat the whole way"). No drill lists, no cadence numbers, no breathing patterns and no fuelling grams, except for topics listed as known below (briefly) or this week's new topic.
- Warm-up and cool-down are steps in "steps_json"; they don't need explaining in "details".`,
  normal: `DETAIL LEVEL: NORMAL.
- ${TITLE_RULES.normal}
- "details": 2-4 sentences: purpose, effort cue, and at most one technique or fuelling cue, preferably from topics the athlete already knows.`,
  deep: `DETAIL LEVEL: DEEP (the athlete asked for it).
- ${TITLE_RULES.deep}
- "details" may include full warm-up drills, technique cues, cadence and fuelling targets.`,
};

/**
 * Prompt block for the weekly planner, plus the topic it introduces (to record
 * once the plan is saved).
 */
async function getDetailPromptBlock(userId, { week = null, discipline = "general", easyPace = 6.5 } = {}) {
  const user = await dbGet(`SELECT detail_level FROM users WHERE id = ?`, [userId]);
  const level = LEVEL_RULES[user?.detail_level] ? user.detail_level : "short";
  const knownRows = await dbAll(`SELECT topic_key FROM athlete_topics WHERE user_id = ?`, [userId]);
  const known = new Set(knownRows.map((r) => r.topic_key));
  const topics = await dbAll(`SELECT key, disciplines, hint FROM coaching_topics ORDER BY priority ASC`);
  const catalogue = topics.length ? topics : CATALOGUE;

  const pick = level === "deep" ? null : catalogue.find(eligibleTopics({ week, discipline, known, longestMinutes: longestMinutesOf(week, easyPace) }));
  const knownHints = catalogue.filter((t) => known.has(t.key)).map((t) => `${t.key}`);

  const lines = [LEVEL_RULES[level]];
  if (knownHints.length && level !== "deep") lines.push(`- Topics the athlete already knows (refer to them briefly, only when relevant): ${knownHints.join(", ")}.`);
  if (pick) lines.push(`- NEW TOPIC TO INTRODUCE THIS WEEK: ${pick.hint} Explain it once, in 2-3 plain sentences, inside the one session where it applies most. Introduce nothing else new.`);
  return { block: lines.join("\n"), newTopic: pick ? pick.key : null };
}

async function markTopicIntroduced(userId, topicKey) {
  if (!topicKey) return;
  await dbRun(`INSERT OR IGNORE INTO athlete_topics (user_id, topic_key) VALUES (?, ?)`, [userId, topicKey]);
}

module.exports = { CATALOGUE, getDetailPromptBlock, markTopicIntroduced, eligibleTopics, titleRuleFor };
