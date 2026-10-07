/**
 * Dated training constraints: travel, illness, missing equipment, schedule crunches.
 *
 * The coach used to remember "I'm in Italy next week, I can only run" only as prose in
 * users.long_term_memory, and every plan writer was merely *asked* to respect it. When the
 * summary dropped the fact (or never had the dates), the Sunday auto-plan happily scheduled
 * bike rides. Constraints now live in athlete_constraints, are written by the coach through a
 * `log_constraint` chat directive, and every plan writer checks its output against them in
 * code (findViolations / repairPlan), so a plan can never contradict what the athlete said.
 *
 * Semantics per constraint (all optional except the dates):
 *   allowed_sports  null = no sport restriction; [] = rest only; ['Run'] = only running.
 *   blocked_sports  sports that may not be scheduled.
 *   max_minutes     max planned minutes per session on those days.
 *   no_intensity    1 = no threshold / VO2max / interval work.
 * Several constraints on one day combine: allowed lists intersect, blocked lists union,
 * the lowest max_minutes wins, and any no_intensity applies.
 */
const db = require("./db");
const i18n = require("./i18n");

const KINDS = ["travel", "illness", "injury", "equipment", "schedule", "other"];
// Which constraint names the reason when several cover the same day.
const KIND_PRIORITY = { illness: 0, injury: 1, travel: 2, equipment: 3, schedule: 4, other: 5 };
// Sports a repaired session may use, in order of preference after the original sport.
const REPAIR_SPORTS = ["Run", "Bike", "Swim"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const all = (sql, params) =>
  new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || []))));
const get = (sql, params) =>
  new Promise((resolve, reject) => db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null))));
const run = (sql, params) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    })
  );

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Maps any sport label the LLM or a recurring session uses onto one canonical name. */
function canonicalSport(sport) {
  const v = String(sport || "").toLowerCase().trim();
  if (!v) return "Other";
  if (/^(rest|rust|ruhe|descanso|repos)\b/.test(v)) return "Rest";
  if (/run|jog|treadmill|lopen|lauf|carrera|course|trail/.test(v)) return "Run";
  if (/bike|ride|cycl|zwift|spin|fiets|wielr|rad|bici|v[ée]lo|mtb/.test(v)) return "Bike";
  if (/swim|zwem|schwimm|nata|nage/.test(v)) return "Swim";
  if (/walk|hike|wandel|wander|camin|marche|randonn/.test(v)) return "Walk";
  if (/mobil|yoga|stretch|pilates/.test(v)) return "Mobility";
  if (/strength|gym|weight|kracht|kraft|fuerza|renfo|hyrox|crossfit/.test(v)) return "Strength";
  return "Other";
}

function parseSportList(value) {
  if (value === undefined || value === null || value === "") return null;
  let list = value;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch (_) {
      list = list.split(",");
    }
  }
  if (!Array.isArray(list)) return null;
  return [...new Set(list.map(canonicalSport).filter((s) => s !== "Rest"))];
}

function rowToConstraint(row) {
  return {
    id: row.id,
    kind: KINDS.includes(row.kind) ? row.kind : "other",
    start_date: row.start_date,
    end_date: row.end_date,
    allowed_sports: parseSportList(row.allowed_sports),
    blocked_sports: parseSportList(row.blocked_sports) || [],
    max_minutes: Number(row.max_minutes) > 0 ? Number(row.max_minutes) : null,
    no_intensity: Number(row.no_intensity) === 1,
    note: row.note || "",
  };
}

/** Active constraints that overlap [fromDate, toDate] (inclusive, YYYY-MM-DD). */
async function getConstraintsForRange(userId, fromDate, toDate) {
  const rows = await all(
    `SELECT * FROM athlete_constraints
     WHERE user_id = ? AND status = 'active' AND end_date >= ? AND start_date <= ?
     ORDER BY start_date ASC, id ASC`,
    [userId, fromDate, toDate]
  );
  return rows.map(rowToConstraint);
}

/** Active constraints that are running now or still to come. */
async function getCurrentAndUpcomingConstraints(userId, todayStr) {
  return getConstraintsForRange(userId, todayStr, "9999-12-31");
}

/** The combined rule for one date, or null when no constraint covers it. */
function effectiveRuleForDate(constraints, date) {
  const covering = (constraints || []).filter((c) => c.start_date <= date && c.end_date >= date);
  if (covering.length === 0) return null;
  let allowed = null;
  const blocked = new Set();
  let maxMinutes = null;
  let noIntensity = false;
  covering.forEach((c) => {
    if (c.allowed_sports) {
      allowed = allowed === null ? [...c.allowed_sports] : allowed.filter((s) => c.allowed_sports.includes(s));
    }
    c.blocked_sports.forEach((s) => blocked.add(s));
    if (c.max_minutes) maxMinutes = maxMinutes ? Math.min(maxMinutes, c.max_minutes) : c.max_minutes;
    if (c.no_intensity) noIntensity = true;
  });
  const primary = [...covering].sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind])[0];
  return { allowed, blocked: [...blocked], maxMinutes, noIntensity, kind: primary.kind, ids: covering.map((c) => c.id) };
}

function isSportAllowed(rule, sport) {
  const canon = canonicalSport(sport);
  if (canon === "Rest") return true;
  if (rule.blocked.includes(canon)) return false;
  if (rule.allowed && !rule.allowed.includes(canon)) return false;
  return true;
}

function parseSteps(workout) {
  const raw = workout.steps !== undefined ? workout.steps : workout.steps_json;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

const INTENSITY_TITLE_RE =
  /\b(threshold|vo2|intervals?|tempo|fartlek|sprints?|hill repeats|race pace|drempel|intervallen|schwelle|intervalle|umbral|intervalos|series|seuil|fractionn[ée])/i;

/** True when a workout contains threshold-or-harder work (zone 4+ or an interval-type title). */
function isHighIntensity(workout) {
  let hard = false;
  const walk = (steps) => {
    (steps || []).forEach((s) => {
      if (!s || hard) return;
      if (Array.isArray(s.steps)) walk(s.steps);
      if (["warmup", "cooldown", "rest", "recovery"].includes(s.type)) return;
      const zone = Number(s.zone);
      if (["heart.rate.zone", "pace.zone", "power.zone"].includes(s.target_type) && zone >= 4) hard = true;
    });
  };
  walk(parseSteps(workout));
  return hard || INTENSITY_TITLE_RE.test(workout.description || workout.title || "");
}

function workoutMinutes(workout) {
  // Lazy: workoutPlanning requires this module.
  const { calculateWorkoutDurationMinutes } = require("./workoutPlanning");
  return calculateWorkoutDurationMinutes({
    ...workout,
    steps_json: workout.steps !== undefined ? workout.steps : workout.steps_json,
  });
}

/** Reasons a single workout breaks the rule for its day ([] when it complies). */
function checkWorkout(workout, rule) {
  if (!rule || canonicalSport(workout.sport) === "Rest") return [];
  const reasons = [];
  const canon = canonicalSport(workout.sport);
  if (rule.blocked.includes(canon)) reasons.push("sport_blocked");
  else if (rule.allowed && !rule.allowed.includes(canon)) reasons.push("sport_not_allowed");
  if (rule.noIntensity && isHighIntensity(workout)) reasons.push("too_intense");
  if (rule.maxMinutes && workoutMinutes(workout) > rule.maxMinutes) reasons.push("too_long");
  return reasons;
}

/** Every workout in `plan` that breaks a constraint. */
function findViolations(plan, constraints) {
  if (!Array.isArray(plan) || !constraints || constraints.length === 0) return [];
  const out = [];
  plan.forEach((workout, index) => {
    if (!workout || !workout.date) return;
    const rule = effectiveRuleForDate(constraints, workout.date);
    const reasons = checkWorkout(workout, rule);
    if (reasons.length > 0) out.push({ index, date: workout.date, sport: workout.sport, description: workout.description, reasons, rule });
  });
  return out;
}

const REASON_TEXT = {
  sport_blocked: "this sport is blocked on that day",
  sport_not_allowed: "this sport is not in the allowed list for that day",
  too_intense: "high intensity is not allowed on that day",
  too_long: "the session is longer than the allowed max minutes",
};

/** Violations as a prompt section for a regeneration attempt. */
function describeViolations(violations) {
  return violations
    .map((v) => `- ${v.date}: "${v.description || v.sport}" (${v.sport}): ${v.reasons.map((r) => REASON_TEXT[r]).join("; ")}`)
    .join("\n");
}

function lowerLabel(lang, sport) {
  const label = i18n.sportLabel(lang, sport);
  return i18n.normalizeLang(lang) === "de" ? label : label.toLowerCase();
}

function buildEasySession(date, sport, minutes, lang, kind) {
  const reason = i18n.t(lang, `constraints.kinds.${kind}`);
  const title = i18n.t(lang, "constraints.easyTitle", { minutes, sport: lowerLabel(lang, sport) });
  return {
    date,
    sport,
    description: title,
    target_rooka: minutes,
    details: i18n.t(lang, "constraints.easyDetails", { reason }),
    steps_json: JSON.stringify([
      {
        type: "interval",
        exerciseName: title,
        condition_type: "time",
        condition_value: minutes,
        ...(sport === "Swim" ? { target_type: "no.target" } : { target_type: "heart.rate.zone", zone: 2 }),
      },
    ]),
    repaired: true,
  };
}

function buildRestDay(date, lang, kind) {
  const reason = i18n.t(lang, `constraints.kinds.${kind}`);
  return {
    date,
    sport: "Rest",
    description: i18n.t(lang, "constraints.restTitle"),
    target_rooka: 0,
    details: i18n.t(lang, "constraints.restDetails", { reason }),
    steps_json: "[]",
    repaired: true,
  };
}

/** A compliant replacement for one violating workout. */
function repairWorkout(workout, rule, lang) {
  const original = canonicalSport(workout.sport);
  const candidates = [original, ...REPAIR_SPORTS].filter(
    (s, i, arr) => REPAIR_SPORTS.includes(s) && arr.indexOf(s) === i && isSportAllowed(rule, s)
  );
  const sport = candidates[0];
  if (!sport) return buildRestDay(workout.date, lang, rule.kind);

  const duration = workoutMinutes(workout) || 45;
  // Same sport: keep the time and drop the intensity. Different sport: a shorter session,
  // since 90 min on the bike is not 90 min of running.
  let minutes = sport === original ? duration : Math.min(60, Math.round(duration * 0.7));
  if (rule.maxMinutes) minutes = Math.min(minutes, rule.maxMinutes);
  minutes = Math.max(15, Math.round(minutes / 5) * 5);
  if (rule.maxMinutes && minutes > rule.maxMinutes) minutes = rule.maxMinutes;
  return buildEasySession(workout.date, sport, minutes, lang, rule.kind);
}

/**
 * Replaces every violating workout with a compliant one.
 * @returns {{ plan: object[], changes: Array<{date, from, to, kind}> }}
 */
function repairPlan(plan, constraints, lang = "en") {
  const violations = findViolations(plan, constraints);
  if (violations.length === 0) return { plan, changes: [] };

  const byIndex = new Map(violations.map((v) => [v.index, v]));
  const changes = [];
  let repaired = plan.map((workout, index) => {
    const v = byIndex.get(index);
    if (!v) return workout;
    const replacement = { ...repairWorkout(workout, v.rule, lang) };
    ["source", "origin"].forEach((k) => {
      if (workout[k] !== undefined) replacement[k] = workout[k];
    });
    changes.push({ date: workout.date, from: workout.sport, to: replacement.sport, kind: v.rule.kind });
    return replacement;
  });

  // Tidy days that now hold duplicates, e.g. a run-only trip turning a Bike+Run brick into two
  // runs: drop a replacement when the day already has that sport, and a rest entry when the
  // day still has training.
  const dates = [...new Set(repaired.map((w) => w.date))];
  dates.forEach((date) => {
    const day = repaired.filter((w) => w.date === date);
    if (day.length < 2) return;
    const keep = new Set(day);
    day.forEach((w) => {
      if (!w.repaired) return;
      const others = day.filter((o) => o !== w && keep.has(o));
      if (others.some((o) => canonicalSport(o.sport) === canonicalSport(w.sport))) keep.delete(w);
      else if (canonicalSport(w.sport) === "Rest" && others.some((o) => canonicalSport(o.sport) !== "Rest")) keep.delete(w);
    });
    repaired = repaired.filter((w) => w.date !== date || keep.has(w));
  });

  // Unchanged workouts keep their identity (repairStoredPlan relies on it).
  return { plan: repaired.map((w) => (w.repaired ? (({ repaired: _r, ...rest }) => rest)(w) : w)), changes };
}

function describeRule(c) {
  const parts = [];
  if (c.allowed_sports) {
    parts.push(c.allowed_sports.length === 0 ? "REST ONLY (no training at all)" : `ONLY these sports allowed: ${c.allowed_sports.join(", ")}`);
  }
  if (c.blocked_sports.length > 0) parts.push(`NOT allowed: ${c.blocked_sports.join(", ")}`);
  if (c.no_intensity) parts.push("no threshold/VO2max/interval work (easy aerobic only)");
  if (c.max_minutes) parts.push(`max ${c.max_minutes} min per session`);
  return parts.length > 0 ? parts.join("; ") : "no hard training restriction (context only)";
}

/** Prompt section listing constraints, with ids so the coach can update or end them. */
function formatConstraintsForPrompt(constraints, todayStr) {
  if (!constraints || constraints.length === 0) return "No active or upcoming constraints.";
  return constraints
    .map((c) => {
      const when =
        todayStr && c.start_date <= todayStr ? "ACTIVE NOW" : todayStr ? `starts ${c.start_date}` : "";
      return `- [Constraint ID ${c.id}] ${c.kind.toUpperCase()} ${c.start_date} to ${c.end_date}${when ? ` (${when})` : ""}: ${describeRule(c)}.${c.note ? ` Note: ${c.note}` : ""}`;
    })
    .join("\n");
}

function normalizeDirective(data, todayStr) {
  const kindRaw = String(data.kind || data.type || "other").toLowerCase();
  const kind = KINDS.find((k) => kindRaw.startsWith(k)) || (/(trip|holiday|vacation|vakantie|reis)/.test(kindRaw) ? "travel" : /(sick|ill|ziek)/.test(kindRaw) ? "illness" : "other");
  let start = DATE_RE.test(data.start_date || "") ? data.start_date : todayStr;
  let end = DATE_RE.test(data.end_date || "") ? data.end_date : null;
  if (end && end < start) [start, end] = [end, start];
  const maxM = Number(data.max_minutes);
  const noIntensity = data.no_intensity === true || data.no_intensity === 1 || data.no_intensity === "true";
  return {
    kind,
    start_date: start,
    end_date: end,
    allowed_sports: data.allowed_sports === undefined ? undefined : parseSportList(data.allowed_sports === null ? null : data.allowed_sports) ?? null,
    blocked_sports: data.blocked_sports === undefined ? undefined : parseSportList(data.blocked_sports) || [],
    max_minutes: data.max_minutes === undefined ? undefined : Number.isFinite(maxM) && maxM > 0 ? Math.round(maxM) : null,
    no_intensity: data.no_intensity === undefined ? undefined : noIntensity,
    note: data.note !== undefined ? String(data.note || "").slice(0, 500) : data.notes !== undefined ? String(data.notes || "").slice(0, 500) : undefined,
  };
}

/**
 * Applies a `log_constraint` / `end_constraint` chat directive.
 * log_constraint with an id updates that constraint; without one it updates an active
 * constraint of the same kind whose dates overlap (the coach tends to re-emit the same
 * trip), otherwise it creates a new one.
 * @returns {Promise<{action: string, id?: number}>}
 */
async function applyConstraintDirective(userId, directive, todayStr) {
  const data = directive.data || {};
  const id = Number(data.id || data.constraint_id) || null;

  if (directive.type === "end_constraint" || directive.type === "cancel_constraint") {
    let target = id ? await get(`SELECT id FROM athlete_constraints WHERE id = ? AND user_id = ? AND status = 'active'`, [id, userId]) : null;
    if (!target && !id) {
      const active = await getCurrentAndUpcomingConstraints(userId, todayStr);
      if (active.length === 1) target = active[0];
    }
    if (!target) return { action: "end_not_found" };
    await run(`UPDATE athlete_constraints SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [target.id]);
    return { action: "ended", id: target.id };
  }

  const n = normalizeDirective(data, todayStr);

  let existing = id ? await get(`SELECT * FROM athlete_constraints WHERE id = ? AND user_id = ?`, [id, userId]) : null;
  if (!existing && n.end_date) {
    existing = await get(
      `SELECT * FROM athlete_constraints
       WHERE user_id = ? AND status = 'active' AND kind = ? AND end_date >= ? AND start_date <= ?
       ORDER BY id DESC LIMIT 1`,
      [userId, n.kind, n.start_date, n.end_date]
    );
  }

  if (existing) {
    const merged = {
      kind: data.kind || data.type ? n.kind : existing.kind,
      start_date: DATE_RE.test(data.start_date || "") ? n.start_date : existing.start_date,
      end_date: n.end_date || existing.end_date,
      allowed_sports: n.allowed_sports !== undefined ? (n.allowed_sports ? JSON.stringify(n.allowed_sports) : null) : existing.allowed_sports,
      blocked_sports: n.blocked_sports !== undefined ? JSON.stringify(n.blocked_sports) : existing.blocked_sports,
      max_minutes: n.max_minutes !== undefined ? n.max_minutes : existing.max_minutes,
      no_intensity: n.no_intensity !== undefined ? (n.no_intensity ? 1 : 0) : existing.no_intensity,
      note: n.note !== undefined ? n.note : existing.note,
    };
    await run(
      `UPDATE athlete_constraints
       SET kind = ?, start_date = ?, end_date = ?, allowed_sports = ?, blocked_sports = ?, max_minutes = ?, no_intensity = ?, note = ?, status = 'active', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [merged.kind, merged.start_date, merged.end_date, merged.allowed_sports, merged.blocked_sports, merged.max_minutes, merged.no_intensity, merged.note, existing.id]
    );
    return { action: "updated", id: existing.id };
  }

  // A trip without an end date is still worth guarding; assume a week and let the coach
  // correct it once the athlete says when they're back.
  const end = n.end_date || addDays(n.start_date, 6);
  const result = await run(
    `INSERT INTO athlete_constraints (user_id, kind, start_date, end_date, allowed_sports, blocked_sports, max_minutes, no_intensity, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      n.kind,
      n.start_date,
      end,
      n.allowed_sports ? JSON.stringify(n.allowed_sports) : null,
      JSON.stringify(n.blocked_sports || []),
      n.max_minutes || null,
      n.no_intensity ? 1 : 0,
      n.note || null,
    ]
  );
  return { action: "created", id: result.lastID };
}

/**
 * Repairs the coach-written rows (not the athlete's own sessions) already stored in
 * micro_plan for [fromDate, toDate], so logging a constraint fixes the calendar at once
 * even if the coach forgot to re-send the week.
 * @returns {Promise<Array<{date, from, to, kind}>>} the changes made
 */
async function repairStoredPlan(userId, fromDate, toDate, lang) {
  const constraints = await getConstraintsForRange(userId, fromDate, toDate);
  if (constraints.length === 0) return [];
  const rows = await all(
    `SELECT * FROM micro_plan
     WHERE user_id = ? AND date >= ? AND date <= ? AND (source IS NULL OR source != 'user')
     ORDER BY date ASC, id ASC`,
    [userId, fromDate, toDate]
  );
  const violations = findViolations(rows, constraints);
  if (violations.length === 0) return [];

  const badDates = [...new Set(violations.map((v) => v.date))];
  const dayRows = rows.filter((r) => badDates.includes(r.date));
  const { plan: repairedDays, changes } = repairPlan(dayRows, constraints, lang);

  for (const r of dayRows) {
    if (repairedDays.includes(r)) continue;
    await run(
      `INSERT INTO deleted_micro_plan (original_id, user_id, date, sport, description, target_rooka, details, steps_json, source, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [r.id, userId, r.date, r.sport, r.description, r.target_rooka, r.details, r.steps_json, r.source]
    );
    await run(`DELETE FROM micro_plan WHERE id = ?`, [r.id]);
  }
  for (const p of repairedDays) {
    if (dayRows.includes(p)) continue; // unchanged row
    await run(
      `INSERT INTO micro_plan (user_id, date, sport, description, target_rooka, details, steps_json, source, origin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, p.date, p.sport, p.description, p.target_rooka, p.details, p.steps_json, p.source || "coach", p.origin || null]
    );
  }
  return changes;
}

/** Short localized sentence for the chat when the server changed days, e.g. "I adjusted Tue 14 Oct ...". */
function describeChangesForChat(changes, lang) {
  if (!changes || changes.length === 0) return "";
  const l = i18n.normalizeLang(lang);
  const locale = { en: "en-GB", nl: "nl-NL", de: "de-DE", es: "es-ES", fr: "fr-FR" }[l];
  const days = [...new Set(changes.map((c) => c.date))]
    .sort()
    .map((d) => new Date(d + "T12:00:00Z").toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }))
    .join(", ");
  return i18n.t(l, "constraints.chatNote", { days, reason: i18n.t(l, `constraints.kinds.${changes[0].kind}`) });
}

module.exports = {
  KINDS,
  canonicalSport,
  effectiveRuleForDate,
  isHighIntensity,
  checkWorkout,
  findViolations,
  describeViolations,
  repairPlan,
  formatConstraintsForPrompt,
  getConstraintsForRange,
  getCurrentAndUpcomingConstraints,
  applyConstraintDirective,
  repairStoredPlan,
  describeChangesForChat,
};
