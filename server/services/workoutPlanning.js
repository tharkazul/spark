const db = require("./db");
const { resolveCoachName, PLAIN_LANGUAGE_RULE } = require("./coachPersona");
const { generateWithFallback } = require("./ai");
const { sendSSEEvent } = require("./sse");
const { sendPushToUser } = require("./pushNotificationService");
const i18n = require("./i18n");
const { planDayTargetRooka } = require("./zones");
const muscleLoad = require("./muscleLoad");
const { getUserMacroPhase } = require("./utils");
const { getUserGoalPromptContext } = require("./goalPromptContext");

/**
 * Calculates the exact 7 consecutive dates (YYYY-MM-DD) from Monday to Sunday
 * for the upcoming week in the Europe/Amsterdam timezone.
 *
 * If today is Sunday, upcoming Monday is tomorrow (+1 day).
 * If today is Monday, upcoming Monday is next week (+7 days).
 */
function getUpcomingWeekMonToSun(baseDate = new Date()) {
  const amsDateStr = new Date(baseDate).toLocaleDateString("en-CA", {
    timeZone: "Europe/Amsterdam",
  });
  const [year, month, day] = amsDateStr.split("-").map(Number);
  const amsDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const dayOfWeek = amsDate.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

  // Days until upcoming Monday:
  // Sunday (0) -> +1 day
  // Monday (1) -> +7 days
  // Tuesday (2) -> +6 days, etc.
  const daysUntilMonday = (8 - dayOfWeek) % 7 || 7;

  const monday = new Date(amsDate);
  monday.setUTCDate(amsDate.getUTCDate() + daysUntilMonday);

  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }

  return {
    mondayStr: dates[0],
    sundayStr: dates[6],
    dates,
  };
}

/**
 * Calculates the exact 7 consecutive dates (YYYY-MM-DD) from Monday to Sunday
 * for the current week in the Europe/Amsterdam timezone.
 */
function getCurrentWeekMonToSun(baseDate = new Date()) {
  const amsDateStr = new Date(baseDate).toLocaleDateString("en-CA", {
    timeZone: "Europe/Amsterdam",
  });
  const [year, month, day] = amsDateStr.split("-").map(Number);
  const amsDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const dayOfWeek = amsDate.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(amsDate);
  monday.setUTCDate(amsDate.getUTCDate() + diffToMonday);

  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }

  return {
    mondayStr: dates[0],
    sundayStr: dates[6],
    dates,
  };
}

/**
 * Computes current CTL, ATL, and TSB from historical activities
 * using the standard exponential moving average constants (42-day & 7-day).
 */
function calculateUserFitnessMetrics(userId) {
  return new Promise((resolve) => {
    db.all(
      `SELECT start_date, COALESCE(rooka_score, tss, 0) as score 
       FROM activities 
       WHERE user_id = ? 
       ORDER BY start_date ASC`,
      [userId],
      (err, rows) => {
        if (err || !rows || rows.length === 0) {
          return resolve({ ctl: 0, atl: 0, tsb: 0 });
        }

        const tssMap = {};
        let earliestDateStr = null;
        rows.forEach((r) => {
          if (!r.start_date) return;
          const dStr = r.start_date.substring(0, 10);
          if (!earliestDateStr) earliestDateStr = dStr;
          tssMap[dStr] = (tssMap[dStr] || 0) + (Number(r.score) || 0);
        });

        if (!earliestDateStr) {
          return resolve({ ctl: 0, atl: 0, tsb: 0 });
        }

        let ctl = 0;
        let atl = 0;
        let currentDate = new Date(earliestDateStr);
        const today = new Date();
        currentDate.setUTCHours(0, 0, 0, 0);
        today.setUTCHours(0, 0, 0, 0);

        while (currentDate <= today) {
          const dStr = currentDate.toISOString().split("T")[0];
          const dailyTss = tssMap[dStr] || 0;
          ctl = ctl + (dailyTss - ctl) * (1 - Math.exp(-1 / 42));
          atl = atl + (dailyTss - atl) * (1 - Math.exp(-1 / 7));
          currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        }

        const tsb = ctl - atl;
        resolve({
          ctl: Math.round(ctl * 10) / 10,
          atl: Math.round(atl * 10) / 10,
          tsb: Math.round(tsb * 10) / 10,
        });
      }
    );
  });
}

/**
 * Builds a fallback 7-day plan if the LLM output is unavailable or unparseable.
 */
// Localized copy for the rule-based fallback / template week: [description, details] per day.
const FALLBACK_PLAN_TEXT = {
  en: [
    ['Aerobic Base Foundation', 'Steady conversational pace endurance training (Zone 2).'],
    ['Core & Kinetic Chain Strength', 'Focus on hip stability, core activation, and postural control.'],
    ['Active Recovery & Mobility', 'Gentle walking, hydration, and muscle tissue recovery.'],
    ['Threshold Tempo Intervals', 'Controlled threshold intervals with full recoveries.'],
    ['Rest & Tissue Adaptation', 'Prioritize deep sleep and restorative nutrition before the weekend.'],
    ['Long Aerobic Progression', 'Steady distance building aerobic capacity and pacing discipline.'],
    ['Weekly Reflection & Rest', 'Light mobility, foam rolling, and preparing for the upcoming week.'],
  ],
  nl: [
    ['Aerobe Basisduur', 'Rustige duurtraining op praattempo (Zone 2).'],
    ['Core & Spierversterking', 'Focus op heupstabiliteit, core en neuromusculaire controle.'],
    ['Hersteldag & Mobiliteit', 'Lichte wandeling, hydratatie en spierherstel.'],
    ['Tempo Interval Training', 'Progressieve intervallen rond je lactaatdrempel, met volledig herstel.'],
    ['Volledige Rustdag', 'Voldoende slaap en herstel ter voorbereiding op het weekend.'],
    ['Lange Duurtraining', 'Gestage lange afstand met focus op hydratatie en energie-inname.'],
    ['Weekevaluatie & Rust', 'Lichte mobiliteit, foamrollen en rustig afronden van de trainingsweek.'],
  ],
  de: [
    ['Grundlagen-Dauerlauf', 'Lockeres Ausdauertraining im Gesprächstempo (Zone 2).'],
    ['Core & Rumpfaufbau', 'Fokus auf Hüftstabilität, Rumpfaktivierung und Haltungskontrolle.'],
    ['Regeneration & Mobilität', 'Lockeres Gehen, ausreichend trinken und Muskelregeneration.'],
    ['Tempo-Intervalle', 'Kontrollierte Intervalle an der Schwelle mit vollständiger Erholung.'],
    ['Ruhetag', 'Viel Schlaf und regenerative Ernährung vor dem Wochenende.'],
    ['Langer Dauerlauf', 'Gleichmäßige lange Einheit für aerobe Kapazität und Pacing-Disziplin.'],
    ['Wochenrückblick & Erholung', 'Leichte Mobilität, Faszienrolle und Vorbereitung auf die neue Woche.'],
  ],
  es: [
    ['Base Aeróbica', 'Entrenamiento de resistencia a ritmo conversacional (Zona 2).'],
    ['Fuerza y Core', 'Enfoque en estabilidad de cadera, activación del core y control postural.'],
    ['Recuperación Activa', 'Caminata suave, hidratación y recuperación muscular.'],
    ['Intervalos de Tempo', 'Intervalos controlados al umbral con recuperaciones completas.'],
    ['Día de Descanso', 'Prioriza el sueño profundo y una nutrición reparadora antes del fin de semana.'],
    ['Tirada Larga Aeróbica', 'Distancia constante para desarrollar capacidad aeróbica y disciplina de ritmo.'],
    ['Descanso y Evaluación', 'Movilidad suave, rodillo de espuma y preparación para la próxima semana.'],
  ],
  fr: [
    ['Endurance Fondamentale', 'Endurance à allure de conversation (Zone 2).'],
    ['Renforcement Musculaire', 'Accent sur la stabilité des hanches, le gainage et le contrôle postural.'],
    ['Récupération & Mobilité', 'Marche légère, hydratation et récupération musculaire.'],
    ['Intervalles Tempo', 'Intervalles contrôlés au seuil avec récupérations complètes.'],
    ['Repos Total', 'Priorité au sommeil profond et à une alimentation réparatrice avant le week-end.'],
    ['Sortie Longue', 'Distance régulière pour développer la capacité aérobie et la gestion de l\'allure.'],
    ['Repos & Bilan', 'Mobilité légère, rouleau de massage et préparation de la semaine suivante.'],
  ],
};

const RECURRING_DETAILS = {
  en: (title, mins, time) => `${title} (${mins} min${time ? ` at ${time}` : ''}) - Scheduled recurring session.`,
  nl: (title, mins, time) => `${title} (${mins} min${time ? ` om ${time}` : ''}) - Vaste terugkerende training.`,
  de: (title, mins, time) => `${title} (${mins} Min.${time ? ` um ${time}` : ''}) - Regelmäßige, fest geplante Einheit.`,
  es: (title, mins, time) => `${title} (${mins} min${time ? ` a las ${time}` : ''}) - Sesión recurrente programada.`,
  fr: (title, mins, time) => `${title} (${mins} min${time ? ` à ${time}` : ''}) - Séance récurrente programmée.`,
};

function buildFallbackPlan(dates, primarySport = 'Run', userLang = 'en') {
  const text = FALLBACK_PLAN_TEXT[userLang] || FALLBACK_PLAN_TEXT.en;
  const sport = primarySport && primarySport !== 'Rest' ? primarySport : 'Run';
  const layout = [
    { sport, target_rooka: 45 },
    { sport: 'Strength', target_rooka: 35 },
    { sport: 'Rest', target_rooka: 0 },
    { sport, target_rooka: 60 },
    { sport: 'Rest', target_rooka: 0 },
    { sport, target_rooka: 75 },
    { sport: 'Rest', target_rooka: 0 },
  ];
  return layout.map((day, i) => ({
    date: dates[i],
    sport: day.sport,
    description: text[i][0],
    target_rooka: day.target_rooka,
    details: text[i][1],
    steps_json: '[]',
  }));
}

/**
 * Guesses the athlete's primary sport from their free-text context (same heuristic the AI
 * fallback uses).
 */
function guessPrimarySport(athleteContext) {
  const ctx = (athleteContext || '').toLowerCase();
  if (ctx.includes('cycl')) return 'Bike';
  if (ctx.includes('swim')) return 'Swim';
  return 'Run';
}

/**
 * Parses users.training_availability ({ Mon: { available, maxMinutes }, ... }) into a map keyed by
 * three-letter lowercase day ('mon'..'sun') -> { available: boolean, maxMinutes: number | null }.
 */
function parseAvailability(raw) {
  const out = {};
  if (!raw) return out;
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    Object.entries(obj || {}).forEach(([day, data]) => {
      const key = String(day).trim().slice(0, 3).toLowerCase();
      const maxM = Number(data?.maxMinutes ?? data?.max_minutes);
      const blocked = data?.available === false || data?.status === 'blocked' || maxM === 0;
      out[key] = {
        available: !blocked,
        maxMinutes: Number.isFinite(maxM) && maxM > 0 ? maxM : null,
      };
    });
  } catch (_) {}
  return out;
}

/**
 * Builds a rule-based 7-day template plan (no LLM) for athletes who are not active in the app.
 *
 * Rules:
 * - Session pattern (Mon..Sun): easy aerobic, strength, rest, quality, rest, long, rest.
 * - Blocked days (availability) become rest; a session on a blocked day moves to the nearest free
 *   available day, and hard sessions (quality, long) are never placed back to back.
 * - Days with the athlete's own workouts are left untouched (no template rows).
 * - Recurring sessions (hockey, spinning, ...) take their day; no extra template session there.
 * - Durations scale with fitness (CTL) and are capped by the day's max minutes.
 * - Every day without a session gets an explicit Rest entry, so rest days count for the streak.
 *
 * @param {string[]} dates 7 dates Mon..Sun (YYYY-MM-DD)
 * @param {object} opts { primarySport, lang, availability (raw), ctl, recurringByDate, skipDates }
 * @returns {Array<{date, sport, description, target_rooka, details, steps_json, source}>}
 */
function buildTemplatePlan(dates, opts = {}) {
  const {
    primarySport = 'Run',
    lang = 'en',
    availability = null,
    ctl = 0,
    recurringByDate = {},
    skipDates = [],
  } = opts;

  // Reuse the localized session texts from the fallback plan.
  const lib = buildFallbackPlan(dates, primarySport, lang);
  const sport = lib[0].sport;
  const sessionDefs = {
    long: { idx: 5, sport, baseMin: 75, hard: true, rookaPerMin: 1.0, priority: 0 },
    quality: { idx: 3, sport, baseMin: 50, hard: true, rookaPerMin: 1.2, priority: 1 },
    easy: { idx: 0, sport, baseMin: 45, hard: false, rookaPerMin: 1.0, priority: 2 },
    strength: { idx: 1, sport: 'Strength', baseMin: 35, hard: false, rookaPerMin: 1.0, priority: 3 },
  };
  // Beginners (low chronic load) get an easy session instead of threshold work.
  const isBeginner = !(Number(ctl) >= 15);
  const scale = Number(ctl) >= 50 ? 1.2 : Number(ctl) >= 20 ? 1.0 : 0.8;

  const avail = parseAvailability(availability);
  const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const days = dates.map((d) => {
    const key = dayKeys[new Date(d + 'T12:00:00Z').getUTCDay()];
    const a = avail[key];
    const hasRecurring = Array.isArray(recurringByDate[d]) && recurringByDate[d].length > 0;
    const skipped = skipDates.includes(d);
    return {
      date: d,
      available: (a ? a.available : true) && !hasRecurring && !skipped,
      maxMinutes: a ? a.maxMinutes : null,
      hasRecurring,
      skipped,
      session: null,
    };
  });

  const isHard = (i) => i >= 0 && i < days.length && days[i].session && sessionDefs[days[i].session].hard;

  // Place sessions in priority order, preferring the pattern day, then the nearest free day.
  Object.entries(sessionDefs)
    .sort((a, b) => a[1].priority - b[1].priority)
    .forEach(([name, def]) => {
      const candidates = [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6]
        .map((off) => def.idx + off)
        .filter((i) => i >= 0 && i < days.length);
      const slot = candidates.find((i) => {
        const d = days[i];
        if (!d.available || d.session) return false;
        if (def.hard && (isHard(i - 1) || isHard(i + 1))) return false;
        return true;
      });
      if (slot !== undefined) days[slot].session = name;
    });

  const plan = [];
  let restCount = 0;
  const restTemplates = [lib[2], lib[4], lib[6]];

  days.forEach((d) => {
    if (d.skipped) return; // athlete's own workouts stay as they are

    if (d.hasRecurring) {
      recurringByDate[d.date].forEach((rt) => {
        plan.push({
          date: d.date,
          sport: rt.sport || 'Other',
          description: rt.title,
          target_rooka: rt.intensity === 'hard' ? 65 : rt.intensity === 'easy' ? 30 : 45,
          details: (RECURRING_DETAILS[lang] || RECURRING_DETAILS.en)(rt.title, rt.duration_minutes || 60, rt.start_time),
          steps_json: '[]',
          source: 'recurring',
        });
      });
      return;
    }

    if (!d.session) {
      const r = restTemplates[restCount % restTemplates.length];
      restCount++;
      plan.push({
        date: d.date,
        sport: 'Rest',
        description: r.description,
        target_rooka: 0,
        details: r.details,
        steps_json: '[]',
        source: 'template',
      });
      return;
    }

    let name = d.session;
    const def = sessionDefs[name];
    // Beginners: swap threshold intervals for a steady aerobic session
    const content = name === 'quality' && isBeginner ? lib[sessionDefs.easy.idx] : lib[def.idx];
    let minutes = Math.round((def.baseMin * scale) / 5) * 5;
    if (d.maxMinutes) minutes = Math.min(minutes, d.maxMinutes);
    minutes = Math.max(15, minutes);
    const perMin = name === 'quality' && isBeginner ? sessionDefs.easy.rookaPerMin : def.rookaPerMin;

    plan.push({
      date: d.date,
      sport: def.sport,
      description: `${minutes} min ${content.description}`,
      target_rooka: Math.round(minutes * perMin),
      details: content.details,
      steps_json: '[]',
      source: 'template',
    });
  });

  return plan;
}

/**
 * Writes a rule-based template week (source = 'template') for an athlete who is not active in
 * the app. Costs zero LLM tokens. Never overwrites an AI/coach plan or the athlete's own
 * workouts; re-running replaces only previous template rows for those dates.
 *
 * @returns {Promise<{ written: boolean, reason?: string, count?: number }>}
 */
async function generateTemplatePlanForUser(userId, dates) {
  if (!dates || dates.length !== 7) {
    throw new Error(`generateTemplatePlanForUser expects exactly 7 dates, received: ${dates?.length}`);
  }
  const all = (sql, params) =>
    new Promise((resolve) => db.all(sql, params, (err, rows) => resolve(err || !rows ? [] : rows)));
  const placeholders = dates.map(() => '?').join(',');

  const user = await new Promise((resolve) =>
    db.get(
      `SELECT id, language, athlete_context, training_availability FROM users WHERE id = ?`,
      [userId],
      (err, row) => resolve(err ? null : row || null)
    )
  );
  if (!user) return { written: false, reason: 'user_not_found' };

  // Don't replace a plan the coach already made (e.g. the athlete asked the coach on Saturday).
  const existing = await all(
    `SELECT date, source FROM micro_plan WHERE user_id = ? AND date IN (${placeholders})`,
    [userId, ...dates]
  );
  if (existing.some((r) => r.source === 'coach' || r.source === null)) {
    return { written: false, reason: 'coach_plan_exists' };
  }
  const skipDates = [...new Set(existing.filter((r) => r.source === 'user').map((r) => r.date))];

  const recurringTrainings = await all(
    `SELECT * FROM recurring_trainings WHERE user_id = ? AND is_active = 1`,
    [userId]
  );
  const dayKeyMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const recurringByDate = {};
  dates.forEach((dStr) => {
    const dayKey = dayKeyMap[new Date(dStr + 'T12:00:00Z').getUTCDay()].toLowerCase();
    const matches = recurringTrainings.filter(
      (rt) => (rt.day_of_week || '').trim().slice(0, 3).toLowerCase() === dayKey
    );
    if (matches.length > 0) recurringByDate[dStr] = matches;
  });

  let ctl = 0;
  try {
    ({ ctl } = await calculateUserFitnessMetrics(userId));
  } catch (_) {}

  const plan = buildTemplatePlan(dates, {
    primarySport: guessPrimarySport(user.athlete_context),
    lang: user.language || 'en',
    availability: user.training_availability,
    ctl,
    recurringByDate,
    skipDates,
  });

  await new Promise((resolve) =>
    db.run(
      `DELETE FROM micro_plan WHERE user_id = ? AND date IN (${placeholders}) AND source IN ('template', 'recurring')`,
      [userId, ...dates],
      () => resolve()
    )
  );

  const insertStmt = db.prepare(
    `INSERT INTO micro_plan (user_id, date, sport, description, target_rooka, details, steps_json, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  plan.forEach((day) => {
    insertStmt.run(userId, day.date, day.sport, day.description, day.target_rooka, day.details, day.steps_json, day.source);
  });
  await new Promise((resolve) => insertStmt.finalize(() => resolve()));

  sendSSEEvent(userId, 'plan_updated', {
    dates,
    count: plan.length,
    timestamp: new Date().toISOString(),
  });

  return { written: true, count: plan.length };
}

/**
 * Generates a 7-day workout plan (Monday through Sunday) for a specific user.
 * Uses the specified token pool (defaults to 'common' for background/cron generation).
 */
async function generateWeeklyPlanForUser(userId, targetDates = null, options = {}) {
  const poolType = options.poolType || 'common';
  const dates = targetDates || getUpcomingWeekMonToSun().dates;

  if (!dates || dates.length !== 7) {
    throw new Error(`generateWeeklyPlanForUser expects exactly 7 dates, received: ${dates?.length}`);
  }

  // 1. Fetch user context
  const user = await new Promise((resolve, reject) => {
    db.get(
      `SELECT id, username, coach_tone, coach_name, coach_context, athlete_context, 
              gender, language, training_availability, cycle_tracking_enabled, long_term_memory 
       FROM users WHERE id = ?`,
      [userId],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });

  if (!user) {
    throw new Error(`User ID ${userId} not found`);
  }

  // 2. Fetch physiological metrics
  const metrics = await new Promise((resolve) => {
    db.all(
      `SELECT metric, value FROM athlete_metrics WHERE user_id = ?`,
      [userId],
      (err, rows) => resolve(err || !rows ? [] : rows)
    );
  });
  const metricsText = metrics.length > 0
    ? metrics.map((m) => `${m.metric}: ${m.value}`).join(", ")
    : "No explicit laboratory/field metrics recorded.";

  // 3. Fetch recent strength and sets
  const recentSetsRows = await new Promise((resolve) => {
    db.all(
      `SELECT sport_type, start_date, sets_json FROM activities 
       WHERE user_id = ? AND sets_json IS NOT NULL AND sets_json != '[]' 
       ORDER BY start_date DESC LIMIT 5`,
      [userId],
      (err, rows) => resolve(err || !rows ? [] : rows)
    );
  });
  let recentSetsText = "No recent strength/PB data recorded.";
  if (recentSetsRows.length > 0) {
    recentSetsText = recentSetsRows
      .map((row) => `Date: ${row.start_date}, Sport: ${row.sport_type}, Details: ${row.sets_json}`)
      .join("\n");
  }

  // 4. Fetch schedule boundaries / availability
  let availabilityText = "No specific schedule boundaries set.";
  if (user.training_availability) {
    try {
      const availObj = typeof user.training_availability === 'string'
        ? JSON.parse(user.training_availability)
        : user.training_availability;
      availabilityText = Object.entries(availObj)
        .map(([day, data]) => {
          const isAvail = data.available !== false && data.status !== 'blocked';
          const maxM = data.maxMinutes ?? data.max_minutes ?? 0;
          return `- ${day.charAt(0).toUpperCase() + day.slice(1)}: ${isAvail ? 'available' : 'rest day / blocked'} (Max minutes: ${maxM})`;
        })
        .join("\n            ");
    } catch (_) {}
  }

  // 5. Fetch active niggles & muscle status
  const niggleRows = await new Promise((resolve) => {
    db.all(
      `SELECT body_part, severity, notes FROM athlete_niggles WHERE user_id = ? AND status = 'active'`,
      [userId],
      (err, rows) => resolve(err || !rows ? [] : rows)
    );
  });
  const nigglesText = niggleRows.length > 0 ? JSON.stringify(niggleRows) : "No active injuries or niggles reported.";

  let muscleStatusText = "All muscle groups fresh.";
  try {
    muscleStatusText = await muscleLoad.getMuscleStatusTextForUser(userId);
  } catch (e) {
    console.error(`[PlanGen] Muscle load computation failed for user ${userId}:`, e.message);
  }

  // 6. Macro phase & PMC fitness metrics
  const phase = await getUserMacroPhase(userId);
  const { ctl, atl, tsb } = await calculateUserFitnessMetrics(userId);
  const goalContext = await getUserGoalPromptContext(userId, user);

  // 7. Check for athlete's pre-scheduled manual sessions (source = 'user')
  const userManualWorkouts = await new Promise((resolve) => {
    db.all(
      `SELECT date, sport, description FROM micro_plan 
       WHERE user_id = ? AND date IN (${dates.map(() => '?').join(',')}) AND source = 'user'`,
      [userId, ...dates],
      (err, rows) => resolve(err || !rows ? [] : rows)
    );
  });
  let userWorkoutsNotice = "";
  if (userManualWorkouts.length > 0) {
    userWorkoutsNotice = `\nATHLETE'S MANUALLY SCHEDULED SESSIONS THIS WEEK (DO NOT OVERWRITE OR CONFLICT):\n` +
      userManualWorkouts.map((w) => `- ${w.date}: ${w.sport} - ${w.description}`).join("\n");
  }

  // 7b. Fetch recurring trainings (non-Rooka recurring sports like hockey, tennis, spinning)
  const dayKeyMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const recurringTrainings = await new Promise((resolve) => {
    db.all(
      `SELECT * FROM recurring_trainings WHERE user_id = ? AND is_active = 1`,
      [userId],
      (err, rows) => resolve(err || !rows ? [] : rows)
    );
  });

  // Map dates (Mon - Sun) to recurring trainings on each day
  const dateToRecurringMap = {};
  dates.forEach((dStr) => {
    const dObj = new Date(dStr + "T12:00:00Z");
    const dayKey = dayKeyMap[dObj.getUTCDay()]; // e.g. 'Mon', 'Tue'
    const matches = recurringTrainings.filter((rt) => {
      const rtDay = (rt.day_of_week || "").trim().slice(0, 3).toLowerCase();
      return rtDay === dayKey.toLowerCase();
    });
    if (matches.length > 0) {
      dateToRecurringMap[dStr] = matches;
    }
  });

  let recurringTrainingsNotice = "";
  if (Object.keys(dateToRecurringMap).length > 0) {
    recurringTrainingsNotice = `\nATHLETE'S RECURRING PERIODICAL SESSIONS (NON-ROOKA TRAININGS - MUST BE INCLUDED ON THE CALENDAR):\n` +
      `The athlete has regular recurring sports/sessions that take place every week. You MUST include these sessions on their exact designated days in the weekly plan so the athlete has a full schedule of their active life, and you MUST balance their remaining endurance training and recovery load around these sessions:\n` +
      Object.entries(dateToRecurringMap).map(([dStr, rts]) => {
        return rts.map(rt => `- ${dStr} (${rt.day_of_week}): "${rt.title}" (Sport: ${rt.sport || 'Other'}, Duration: ${rt.duration_minutes || 60}m, Intensity: ${rt.intensity || 'moderate'}${rt.start_time ? `, Time: ${rt.start_time}` : ''})`).join("\n");
      }).join("\n");
  }

  // Language mapping
  const langMap = {
    nl: 'Dutch (Nederlands)',
    de: 'German (Deutsch)',
    es: 'Spanish (Español)',
    fr: 'French (Français)',
    en: 'English'
  };
  const targetLanguageName = langMap[user.language] || 'English';

  const coachName = resolveCoachName(user);
  let coachToneText = user.coach_tone || 'Empathetic but demanding elite endurance coach.';
  if (user.coach_tone === 'custom' || user.coach_tone === 'Configure own coach') {
    coachToneText = user.coach_context ? `Custom tone: ${user.coach_context}` : 'Custom coach persona';
  }

  const systemPrompt = `You are Coach ${coachName}, an elite endurance and athletic performance coach. ${PLAIN_LANGUAGE_RULE}
Tone: ${coachToneText}
${user.coach_context ? `Coach Custom Context & Rules: ${user.coach_context}` : ''}
Athlete Context: ${user.athlete_context || "General endurance athlete"}
ATHLETE LIFE CONTEXT & LONG-TERM MEMORY:
${user.long_term_memory || "No long-term memory recorded."}
Athlete Primary Goal: ${goalContext.goalName} (${goalContext.goalDate || 'Target Date TBD'})
Gender: ${user.gender || "Prefer not to share"}
${(user.gender === "Female" || user.gender === "Prefer not to share" || user.gender === "Prefer not to say") && user.cycle_tracking_enabled !== 0 ? "IMPORTANT: Adjust training load taking the menstrual cycle into consideration. Distribute exercises carefully around the physically demanding days." : ""}
Schedule Boundaries:
${availabilityText}
Key Physiological Metrics: ${metricsText}
MUSCLE LOAD OVER THE LAST 7 DAYS:
${muscleStatusText}
Recent Strength & PB History:
${recentSetsText}
ACTIVE INJURIES/NIGGLES:
${nigglesText}
${userWorkoutsNotice}
${recurringTrainingsNotice}

${goalContext.promptContext}

CRITICAL RULES:
0. LANGUAGE PERSISTENCE & UNIFORMITY MANDATE: The athlete's preferred language is ${targetLanguageName} (${user.language || 'en'}). You MUST write all workout descriptions, details, analysis, and commentary fluently and exclusively in ${targetLanguageName}. NEVER mix Dutch and English within a sentence or use Dutch activity names inside English sentences (or vice-versa).
1. ACTIVITY TYPE (SPORT): The 'sport' field is REQUIRED for every workout in the JSON and MUST be exactly one of: 'Run', 'Bike', 'Swim', 'Strength', 'Rest'. Never leave it blank. For Strength workouts, you MUST include an "exerciseName" in each step.
2. DATES: You are generating a 7-day training plan for the coming week starting Monday ${dates[0]} and ending Sunday ${dates[6]}. Output workouts for these exact 7 dates:
   - Monday: ${dates[0]}
   - Tuesday: ${dates[1]}
   - Wednesday: ${dates[2]}
   - Thursday: ${dates[3]}
   - Friday: ${dates[4]}
   - Saturday: ${dates[5]}
   - Sunday: ${dates[6]}
3. SCHEDULE BOUNDARIES: You MUST adhere to daily time constraints. If a day is marked 'blocked' or max_minutes is 0, schedule 'Rest'.
3b. RECURRING NON-ROOKA ACTIVITIES: If any recurring non-Rooka activities are listed in ATHLETE'S RECURRING PERIODICAL SESSIONS above (e.g. hockey, spinning, tennis, club sports), you MUST include a workout entry on that exact day representing this activity. Set 'sport' to the relevant sport or 'CrossTraining' / 'Cardio' / 'Strength' / 'Other' (or closest match), use the exact session name as the description, set an appropriate target_rooka reflecting the duration and intensity (e.g. 40-70), and in 'details' describe the session and coaching notes on how it fits into their weekly athletic development. Balance the athlete's other workouts, intensities, and recovery days around these sessions.
3c. TRAVEL, VACATION, HOLIDAYS & SPECIAL CONSTRAINTS (CRITICAL): Check ATHLETE LIFE CONTEXT & LONG-TERM MEMORY above carefully. If the athlete is currently traveling, on holiday/vacation (e.g. in Italy, abroad, visiting family), lacks gym/equipment access, or has an ongoing illness/injury recovery, you MUST adapt the entire weekly plan to fit those exact constraints:
   - Do NOT schedule gym/strength workouts with barbells, machines, or heavy weights if they do not have gym access while traveling (prescribe bodyweight mobility or omit strength).
   - Do NOT schedule indoor bike FTP sessions or road bike workouts if they do not have their bike on vacation.
   - Do NOT schedule punishing VO2max / Z4 intervals if the user agreed to flexible aerobic Zone 2 daylight running while traveling.
   - Respect their travel reality completely and maintain aerobic fitness without causing stress or guilt.
4. MUSCLE LOAD: Any group listed HIGH is heavily loaded. Do not schedule consecutive sessions overloading that group.
5. INJURIES: Respect active niggles and substitute lower impact activities where necessary.
6. TARGETS & METRIC PARITY MANDATE (CRITICAL):
   - Metric units exclusively (km, kg, km/h, meters). Distance condition values must be in pure meters (e.g., use 5000 for 5km, 1000 for 1km).
   - METRIC PARITY RULE: The structured metric you assign to each step MUST strictly match the coaching metric you prescribe in your conversational summary and workout 'details'!
   - EXACT RUNNING PACE: Whenever you prescribe a specific running pace in text or details (e.g. "run at 4:15 pace", "5:00 min/km", "threshold pace 4:05"): you MUST set "target_type": "pace.exact" and "target_value": "4:15" (pure mm:ss string, NEVER include "min/km" in target_value!). NEVER substitute or default to "heart.rate.zone" when you gave the athlete a pace target!
   - PACE ZONES: For a pace zone instead of an exact pace: set "target_type": "pace.zone" and "zone": <1-5>.
   - EXACT CYCLING POWER: If you prescribe wattage/power (e.g. 250W): set "target_type": "power.exact" and set "target_value": "250" (do NOT include "W" in target_value!).
   - POWER ZONES: For a power zone instead of an exact wattage: set "target_type": "power.zone" and "zone": <1-7>.
   - HEART RATE ZONES: ONLY set "target_type": "heart.rate.zone" and "zone": <1-5> when you are explicitly prescribing heart rate training (e.g. Zone 2 aerobic base run, Zone 1 recovery, or HR cap).
   - OPEN / NO TARGET: For warmup, cooldown, mobility drills, or open efforts: set "target_type": "no.target".
7. STRENGTH & MULTI-EXERCISE PARITY (CRITICAL):
   - EVERY exercise, station, carry, lift, or core movement prescribed in 'details' MUST have its own corresponding repeat block or step in the 'steps_json' array!
   - NEVER output only 1 exercise in 'steps_json' when you prescribed multiple exercises in 'details'! If you prescribe 3 exercises (e.g. Barbell Back Squat, Farmers Carry, and Pallof Press), you MUST output 3 separate repeat blocks in 'steps_json'.
   - For each strength/functional step, include:
     * "exerciseName": exact movement name (e.g., "Barbell Back Squat", "Farmers Carry", "Pallof Press").
     * "condition_type": "reps" (for reps), "distance" (in meters for carries/sleds, e.g. 100), or "time_sec"/"time" (for planks/holds).
     * "condition_value": number of reps, meters, or seconds.
     * "weight": load in kg if applicable (e.g., 60 or 20).
     * "target_type": "weight" (or "no.target").
     * A "rest" step between sets with "condition_type": "time_sec" and seconds in "condition_value" (e.g., 60 or 90).
   - For Warmup and Cooldown steps, ALWAYS include "exerciseName" describing the dynamic mobility or stretches (e.g. "Cossack Squats & Inchworms", "Couch Stretch & Pigeon Pose").
8. WORKOUT DETAILS & PRESCRIPTION GRANULARITY (CRITICAL):
   - Every workout's 'details' field is the primary athlete-facing coaching prescription.
   - NEVER write basic or vague one-liners like "intervals", "easy run", or "tempo session".
   - You MUST prescribe concrete technique cues, drills, equipment (e.g. pull buoy & hand paddles, aero bars, SkiErg, sled push), specific movement focus (e.g. "focus on high heels / rapid heel recovery", "early vertical forearm EVF catch", "single-leg pedaling"), dynamic mobility warm-ups, and session fueling notes.
   - Ensure 100% PARITY between all movements described in 'details' and all step blocks in 'steps_json'.
9. FORMAT: You must append a JSON code block at the very end of your response containing the array of 7 days:
\`\`\`json
[
  {
    "date": "${dates[0]}",
    "sport": "Run",
    "description": "Aerobic Base & Cadence Drill",
    "target_rooka": 45,
    "details": "Warm-up: 2x10 ankle rocks, 3x30m A-skips and butt kicks cueing rapid heel recovery (high heels). Main set: 45 min steady Zone 2 holding 175-180 spm cadence. Cool-down: 4x60m relaxed strides + calf mobility.",
    "steps_json": "[{\\"type\\": \\"warmup\\", \\"exerciseName\\": \\"A-Skips & Ankle Rocks\\", \\"condition_type\\": \\"time\\", \\"condition_value\\": 10, \\"target_type\\": \\"no.target\\"}, {\\"type\\": \\"interval\\", \\"exerciseName\\": \\"Zone 2 Aerobic Base\\", \\"condition_type\\": \\"time\\", \\"condition_value\\": 45, \\"target_type\\": \\"heart.rate.zone\\", \\"zone\\": 2}, {\\"type\\": \\"cooldown\\", \\"exerciseName\\": \\"Strides & Calf Mobility\\", \\"condition_type\\": \\"time\\", \\"condition_value\\": 10, \\"target_type\\": \\"no.target\\"}]"
  },
  {
    "date": "${dates[1]}",
    "sport": "Run",
    "description": "5x1000m Threshold Intervals",
    "target_rooka": 70,
    "details": "Warm-up: 10 min easy jog + dynamic form drills. Main set: 5x1000m at threshold pace (4:10 min/km) with 90s active jog recovery. Cool-down: 10 min easy recovery jog + calf stretching.",
    "steps_json": "[{\\"type\\": \\"warmup\\", \\"exerciseName\\": \\"Dynamic Warmup Jog\\", \\"condition_type\\": \\"time\\", \\"condition_value\\": 10, \\"target_type\\": \\"no.target\\"}, {\\"type\\": \\"repeat\\", \\"iterations\\": 5, \\"steps\\": [{\\"type\\": \\"interval\\", \\"exerciseName\\": \\"1000m Threshold\\", \\"condition_type\\": \\"distance\\", \\"condition_value\\": 1000, \\"target_type\\": \\"pace.exact\\", \\"target_value\\": \\"4:10\\"}, {\\"type\\": \\"rest\\", \\"condition_type\\": \\"time_sec\\", \\"condition_value\\": 90, \\"target_type\\": \\"heart.rate.zone\\", \\"zone\\": 1}]}, {\\"type\\": \\"cooldown\\", \\"exerciseName\\": \\"Easy Recovery Jog\\", \\"condition_type\\": \\"time\\", \\"condition_value\\": 10, \\"target_type\\": \\"no.target\\"}]"
  },
  {
    "date": "${dates[2]}",
    "sport": "Strength",
    "description": "Lower Body & Hyrox Core Power",
    "target_rooka": 45,
    "details": "Warmup: Cossack squats, inchworms (10 min). Main: Barbell Back Squat 3x10 reps (90s rest), Farmers Carry 4x100m (60s rest), Pallof Press 3x12 reps (45s rest). Cooldown: Couch stretch & pigeon pose (5 min).",
    "steps_json": "[{\\"type\\": \\"warmup\\", \\"exerciseName\\": \\"Cossack Squats & Inchworms\\", \\"condition_type\\": \\"time\\", \\"condition_value\\": 10, \\"target_type\\": \\"no.target\\"}, {\\"type\\": \\"repeat\\", \\"iterations\\": 3, \\"steps\\": [{\\"type\\": \\"interval\\", \\"exerciseName\\": \\"Barbell Back Squat\\", \\"condition_type\\": \\"reps\\", \\"condition_value\\": 10, \\"weight\\": 60, \\"target_type\\": \\"weight\\"}, {\\"type\\": \\"rest\\", \\"condition_type\\": \\"time_sec\\", \\"condition_value\\": 90, \\"target_type\\": \\"no.target\\"}]}, {\\"type\\": \\"repeat\\", \\"iterations\\": 4, \\"steps\\": [{\\"type\\": \\"interval\\", \\"exerciseName\\": \\"Farmers Carry\\", \\"condition_type\\": \\"distance\\", \\"condition_value\\": 100, \\"weight\\": 20, \\"target_type\\": \\"weight\\"}, {\\"type\\": \\"rest\\", \\"condition_type\\": \\"time_sec\\", \\"condition_value\\": 60, \\"target_type\\": \\"no.target\\"}]}, {\\"type\\": \\"repeat\\", \\"iterations\\": 3, \\"steps\\": [{\\"type\\": \\"interval\\", \\"exerciseName\\": \\"Pallof Press\\", \\"condition_type\\": \\"reps\\", \\"condition_value\\": 12, \\"target_type\\": \\"no.target\\"}, {\\"type\\": \\"rest\\", \\"condition_type\\": \\"time_sec\\", \\"condition_value\\": 45, \\"target_type\\": \\"no.target\\"}]}, {\\"type\\": \\"cooldown\\", \\"exerciseName\\": \\"Couch Stretch & Pigeon Pose\\", \\"condition_type\\": \\"time\\", \\"condition_value\\": 5, \\"target_type\\": \\"no.target\\"}]"
  }
]
\`\`\``;

  const userPrompt = `Please build my training plan for the upcoming week (Monday ${dates[0]} to Sunday ${dates[6]}) in ${targetLanguageName}.
Current Training Phase: ${phase}
Fitness (CTL): ${ctl}
Fatigue (ATL): ${atl}
Form (TSB): ${tsb}

Analyze my current Form (TSB) and muscle readiness. Give me a brief, punchy coaching summary of this week's focus, followed by the JSON block for Monday to Sunday.`;

  let aiReply = '';
  try {
    aiReply = await generateWithFallback(
      userPrompt,
      systemPrompt,
      null,
      null,
      userId,
      poolType,
      false,
      { language: user.language }
    );
  } catch (errAi) {
    console.warn(`[WeeklyPlan] AI generation warning for user ${userId}:`, errAi.message);
  }

  let planData = [];
  const jsonMatch = aiReply ? aiReply.match(/```json([\s\S]*?)```/) : null;
  if (jsonMatch) {
    try {
      planData = JSON.parse(jsonMatch[1]);
    } catch (e) {
      console.warn(`[WeeklyPlan] Failed to parse JSON block from AI reply for user ${userId}`);
    }
  } else if (aiReply && aiReply.trim().startsWith('[') && aiReply.trim().endsWith(']')) {
    try {
      planData = JSON.parse(aiReply.trim());
    } catch (e) {}
  }

  // Fallback to structured schedule if AI did not return a valid array
  if (!Array.isArray(planData) || planData.length === 0) {
    planData = buildFallbackPlan(dates, guessPrimarySport(user.athlete_context), user.language);
  }

  // Filter and sanitize plan data
  const validSports = new Set(['Run', 'Bike', 'Swim', 'Strength', 'Rest']);
  const sanitizedPlan = planData.map((item, idx) => {
    const assignedDate = dates.includes(item.date) ? item.date : (dates[idx] || dates[0]);
    const sport = validSports.has(item.sport) ? item.sport : 'Run';
    const description = item.description || (sport === 'Rest' ? 'Rest & Recovery' : `${sport} Session`);
    const details = item.details || '';
    const stepsJson = typeof item.steps === 'object'
      ? JSON.stringify(item.steps)
      : typeof item.steps_json === 'object'
      ? JSON.stringify(item.steps_json)
      : (typeof item.steps_json === 'string' ? item.steps_json : '[]');

    const targetRooka = planDayTargetRooka({
      sport,
      target_rooka: item.target_rooka,
      steps_json: stepsJson,
    }) || (sport === 'Rest' ? 0 : 40);

    return {
      date: assignedDate,
      sport,
      description,
      target_rooka: targetRooka,
      details,
      steps_json: stepsJson,
      source: 'coach',
    };
  });

  // Ensure any recurring trainings for this week are represented in the plan
  if (typeof dateToRecurringMap === 'object') {
    Object.entries(dateToRecurringMap).forEach(([dStr, rts]) => {
      rts.forEach((rt) => {
        const alreadyHas = sanitizedPlan.some(p => p.date === dStr && (
          p.description?.toLowerCase().includes(rt.title.toLowerCase()) || 
          p.sport?.toLowerCase() === rt.sport?.toLowerCase()
        ));
        if (!alreadyHas) {
          sanitizedPlan.push({
            date: dStr,
            sport: rt.sport || 'Other',
            description: rt.title,
            target_rooka: rt.intensity === 'hard' ? 65 : rt.intensity === 'easy' ? 30 : 45,
            details: `${rt.title} (${rt.duration_minutes} min${rt.start_time ? ` at ${rt.start_time}` : ''}) - Scheduled recurring session.`,
            steps_json: '[]',
            source: 'recurring',
          });
        }
      });
    });
  }

  // 8. Atomic Database Write:
  // First archive existing coach/recurring workouts that are being replaced so user can recover if desired
  await new Promise((resolve) => {
    const placeholders = dates.map(() => '?').join(',');
    db.run(
      `INSERT INTO deleted_micro_plan (user_id, date, sport, description, target_rooka, details, steps_json, source)
       SELECT user_id, date, sport, description, target_rooka, details, steps_json, source
       FROM micro_plan
       WHERE user_id = ? AND date IN (${placeholders}) AND (source = 'coach' OR source = 'recurring' OR source IS NULL)
         AND sport IS NOT NULL AND LOWER(sport) != 'rest'`,
      [userId, ...dates],
      (archiveErr) => {
        if (archiveErr) console.error(`[WeeklyPlan] Error archiving prior plan for user ${userId}:`, archiveErr);
        resolve();
      }
    );
  });

  // Remove existing coach/recurring generated workouts for these dates, leaving user-created workouts intact
  await new Promise((resolve) => {
    const placeholders = dates.map(() => '?').join(',');
    db.run(
      `DELETE FROM micro_plan 
       WHERE user_id = ? AND date IN (${placeholders}) AND (source = 'coach' OR source = 'recurring' OR source = 'template' OR source IS NULL)`,
      [userId, ...dates],
      (err) => {
        if (err) console.error(`[WeeklyPlan] Error clearing prior plan for user ${userId}:`, err);
        resolve();
      }
    );
  });

  const insertStmt = db.prepare(`
    INSERT INTO micro_plan (user_id, date, sport, description, target_rooka, details, steps_json, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  sanitizedPlan.forEach((day) => {
    insertStmt.run(
      userId,
      day.date,
      day.sport,
      day.description,
      day.target_rooka,
      day.details,
      day.steps_json,
      day.source || 'coach'
    );
  });

  await new Promise((resolve) => insertStmt.finalize(() => resolve()));

  // 9. Coach Acknowledgement in chat history
  let coachNote = aiReply ? aiReply.replace(/```json[\s\S]*?```/, "").trim() : "";
  coachNote = coachNote.replace(/[^.!?\n]*:\s*$/i, "").trim();

  if (!coachNote || coachNote.length < 10) {
    coachNote = user.language === 'nl'
      ? `Ik heb zojuist je trainingsschema voor komende week (maandag ${dates[0]} t/m zondag ${dates[6]}) klaargezet. Check je dashboard en laten we er een sterke week van maken!`
      : user.language === 'de'
      ? `Ich habe deinen Trainingsplan für die kommende Woche (Montag ${dates[0]} bis Sonntag ${dates[6]}) vorbereitet. Schau auf dein Dashboard – lass uns Vollgas geben!`
      : user.language === 'es'
      ? `He preparado tu plan de entrenamiento para la próxima semana (lunes ${dates[0]} a domingo ${dates[6]}). ¡Revisa tu panel y a darlo todo!`
      : user.language === 'fr'
      ? `J'ai préparé ton programme d'entraînement pour la semaine prochaine (du lundi ${dates[0]} au dimanche ${dates[6]}). Regarde ton tableau de bord et allons-y à fond !`
      : `I've just built and pushed your training schedule for the coming week (Monday ${dates[0]} to Sunday ${dates[6]}). Check your calendar—let's make it a great week!`;
  }

  db.run(
    `INSERT INTO chat_history (user_id, role, content, mood) VALUES (?, 'coach', ?, 'hype')`,
    [userId, coachNote],
    (err) => {
      if (err) console.error(`[WeeklyPlan] Error inserting coach chat message for user ${userId}:`, err);
    }
  );

  // 10. Real-time updates & Push Notifications
  sendSSEEvent(userId, 'plan_updated', {
    dates,
    count: sanitizedPlan.length,
    timestamp: new Date().toISOString(),
  });
  sendSSEEvent(userId, 'unread_message', {
    message: coachNote,
    mood: 'hype',
  });

  sendPushToUser(userId, {
    title: i18n.t(user.language, 'push.weeklyPlanReady.title'),
    body: i18n.t(user.language, 'push.weeklyPlanReady.body', { coach: coachName }),
    data: { url: '/(tabs)/coach', type: 'plan_updated', dates },
    badge: 1,
  }).catch((err) => console.error(`[WeeklyPlan] Push error for user ${userId}:`, err?.message));

  return {
    success: true,
    userId,
    targetDates: dates,
    workoutsCount: sanitizedPlan.length,
  };
}

/**
 * Safeguard for inactive users (any tier):
 * Sends a polite notification and coach chat inquiry asking if they want to plan the next week with the coach.
 * When a template week was written (options.hasTemplatePlan), the message says so and invites the
 * athlete to have the coach tailor it. This costs ZERO LLM tokens.
 */
async function sendInactiveUserWeeklyPlanInquiry(user, options = {}) {
  const hasTemplatePlan = Boolean(options.hasTemplatePlan);
  const userId = user.id;
  const coachName = resolveCoachName(user);
  const lang = user.language || 'en';
  const displayName = user.username || '';

  // Prevent duplicate outreach if the job is re-run on the same day
  const alreadySent = await new Promise((resolve) => {
    db.get(
      `SELECT id FROM chat_history 
       WHERE user_id = ? AND role = 'coach' 
         AND (content LIKE '%trainingsschema%' OR content LIKE '%training plan%' OR content LIKE '%Trainingsplan%' OR content LIKE '%plan de entrenamiento%' OR content LIKE '%programme d''entraînement%')
         AND substr(timestamp, 1, 10) = date('now')
       LIMIT 1`,
      [userId],
      (err, row) => resolve(!!row)
    );
  });

  let pushTitle = `Plan next week with Coach ${coachName}?`;
  let pushBody = `Hey ${displayName}! Would you like me to prepare your training schedule for next week? Tap to chat!`;
  let chatMessage = `Hey ${displayName}! I noticed we haven't trained together much this past week. Would you like me to build a personalized training plan for the coming week? Just reply here with your schedule or goals, or let me know "let's do it" and I'll tailor the week for you!`;

  if (lang === 'nl') {
    pushTitle = `Komende week inplannen met Coach ${coachName}?`;
    pushBody = `Hey ${displayName}! Zullen we samen je trainingen voor komende week plannen? Tik hier om te openen!`;
    chatMessage = `Hey ${displayName}! Ik zag dat we afgelopen week wat minder getraind hebben. Zullen we samen je schema voor komende week inplannen? Laat me hier weten wat je doelen of beschikbaarheid zijn, of zeg gewoon "maak maar een schema" en ik zet het voor je klaar!`;
  } else if (lang === 'de') {
    pushTitle = `Nächste Woche mit Coach ${coachName} planen?`;
    pushBody = `Hey ${displayName}! Wollen wir dein Training für die kommende Woche vorbereiten? Tippe hier!`;
    chatMessage = `Hey ${displayName}! Ich habe gesehen, dass wir letzte Woche etwas ruhiger unterwegs waren. Möchtest du, dass wir dein Training für die kommende Woche zusammen planen? Sag mir einfach hier Bescheid oder antworte mit "Erstelle einen Plan" und ich lege los!`;
  } else if (lang === 'es') {
    pushTitle = `¿Planificamos la semana con Coach ${coachName}?`;
    pushBody = `¡Hola ${displayName}! ¿Te gustaría que preparemos tus entrenamientos de la próxima semana? ¡Toca aquí!`;
    chatMessage = `¡Hola ${displayName}! He notado que hemos entrenado un poco menos esta semana. ¿Te gustaría que preparemos juntos tu plan de entrenamiento para la próxima semana? ¡Dime tus objetivos o disponibilidad por aquí y lo organizamos!`;
  } else if (lang === 'fr') {
    pushTitle = `Planifier la semaine avec Coach ${coachName} ?`;
    pushBody = `Salut ${displayName} ! Tu veux préparer tes entraînements pour la semaine prochaine ? Touche ici !`;
    chatMessage = `Salut ${displayName} ! J'ai remarqué qu'on a un peu moins bougé cette semaine. Tu veux qu'on prépare ton programme d'entraînement pour la semaine prochaine ensemble ? Dis-moi ce qui t'arrange par ici et je m'en occupe !`;
  }

  // Template week written: tell the athlete it's there and offer to tailor it.
  // Keep the dedupe keywords above ("training plan", "trainingsschema", ...) in every variant.
  if (hasTemplatePlan) {
    const tpl = {
      en: {
        title: `Your week is ready`,
        body: `Coach ${coachName} set up a standard training plan for you. Tap to make it your own.`,
        chat: `Hey ${displayName}! I've put a standard training plan in your calendar for the coming week, so you have something to work with. Want me to tailor it to your schedule, energy and goals? Just reply here and we'll adjust it together!`,
      },
      nl: {
        title: `Je week staat klaar`,
        body: `Coach ${coachName} heeft een standaard trainingsschema voor je klaargezet. Tik om het persoonlijk te maken.`,
        chat: `Hey ${displayName}! Ik heb een standaard trainingsschema voor komende week in je agenda gezet, zodat je meteen aan de slag kunt. Zal ik het afstemmen op jouw planning, energie en doelen? Reageer hier en we passen het samen aan!`,
      },
      de: {
        title: `Deine Woche ist bereit`,
        body: `Coach ${coachName} hat dir einen Standard-Trainingsplan erstellt. Tippe, um ihn anzupassen.`,
        chat: `Hey ${displayName}! Ich habe dir einen Standard-Trainingsplan für die kommende Woche in den Kalender gelegt, damit du direkt loslegen kannst. Soll ich ihn an deinen Zeitplan, deine Energie und deine Ziele anpassen? Antworte einfach hier!`,
      },
      es: {
        title: `Tu semana está lista`,
        body: `Coach ${coachName} te ha preparado un plan de entrenamiento estándar. Toca para personalizarlo.`,
        chat: `¡Hola ${displayName}! He puesto un plan de entrenamiento estándar en tu calendario para la próxima semana, para que tengas algo con lo que empezar. ¿Quieres que lo adapte a tu horario, energía y objetivos? ¡Respóndeme aquí y lo ajustamos juntos!`,
      },
      fr: {
        title: `Ta semaine est prête`,
        body: `Coach ${coachName} t'a préparé un programme d'entraînement standard. Touche pour le personnaliser.`,
        chat: `Salut ${displayName} ! J'ai mis un programme d'entraînement standard dans ton calendrier pour la semaine prochaine, pour que tu aies une base. Tu veux que je l'adapte à ton emploi du temps, ton énergie et tes objectifs ? Réponds-moi ici !`,
      },
    }[lang] || null;
    const chosen = tpl || {
      title: `Your week is ready`,
      body: `Coach ${coachName} set up a standard training plan for you. Tap to make it your own.`,
      chat: `Hey ${displayName}! I've put a standard training plan in your calendar for the coming week, so you have something to work with. Want me to tailor it to your schedule, energy and goals? Just reply here and we'll adjust it together!`,
    };
    pushTitle = chosen.title;
    pushBody = chosen.body;
    chatMessage = chosen.chat;
  }

  if (!alreadySent) {
    db.run(
      `INSERT INTO chat_history (user_id, role, content, mood) VALUES (?, 'coach', ?, 'friendly')`,
      [userId, chatMessage],
      (err) => {
        if (err) console.error(`[WeeklyPlanInquiry] Error inserting chat message for user ${userId}:`, err?.message);
      }
    );

    sendSSEEvent(userId, 'unread_message', {
      message: chatMessage,
      mood: 'friendly',
    });
  }

  try {
    await sendPushToUser(userId, {
      title: pushTitle,
      body: pushBody,
      data: { url: '/(tabs)/coach', type: 'coach_plan_inquiry' },
      badge: 1,
    });
  } catch (pushErr) {
    console.warn(`[WeeklyPlanInquiry] Push notification warning for user ${userId}:`, pushErr?.message);
  }
}

/**
 * Weekly Scheduled Cron Job:
 * Runs on Sunday evening and plans the coming week.
 *
 * Who gets an AI-generated plan (same rule for every subscription tier — the coach's plan is
 * the core product, Rooka+ only adds more coach messages to discuss it):
 *   - athletes who used the app in the last 7 days (users.last_active_at, set by any
 *     authenticated app request), and
 *   - admin accounts (internal testing).
 * Background signals such as Strava/device syncs, push-token refreshes or weight imports do NOT
 * count as using the app, so we don't spend LLM tokens on athletes who never open Rooka.
 *
 * Everyone else gets a friendly push notification + coach chat inquiry asking whether they'd
 * like to plan the coming week together.
 */
async function runWeeklyWorkoutPlanningJob(options = {}) {
  console.log('🗓️ [CRON] Starting Sunday weekly workout planning job...');
  let weekInfo;
  if (options.dates && Array.isArray(options.dates) && options.dates.length > 0) {
    weekInfo = {
      mondayStr: options.dates[0],
      sundayStr: options.dates[options.dates.length - 1],
      dates: options.dates,
    };
  } else if (options.targetWeek === 'current' || options.currentWeek) {
    weekInfo = getCurrentWeekMonToSun(options.baseDate || new Date());
  } else {
    weekInfo = getUpcomingWeekMonToSun(options.baseDate || new Date());
  }
  const { mondayStr, sundayStr, dates } = weekInfo;
  console.log(`📅 [CRON] Generating week: ${mondayStr} (Monday) to ${sundayStr} (Sunday)`);

  const userFilterSql = options.userId ? ` AND u.id = ?` : ``;
  const userFilterParams = options.userId ? [options.userId] : [];

  const users = await new Promise((resolve) => {
    db.all(
      `SELECT u.id, u.username, u.subscription_tier, u.role, u.language, u.coach_name, u.coach_tone,
         CASE WHEN u.role = 'admin' THEN 1 ELSE 0 END AS is_admin,
         CASE
           WHEN u.last_active_at IS NOT NULL AND u.last_active_at >= datetime('now', '-7 days') THEN 1
           ELSE 0
         END AS is_active_recently
       FROM users u 
       WHERE u.deleted_at IS NULL${userFilterSql}`,
      userFilterParams,
      (err, rows) => {
        if (err) {
          console.error('❌ [CRON] Error querying users for weekly planning:', err);
          return resolve([]);
        }
        resolve(rows || []);
      }
    );
  });

  if (!users || users.length === 0) {
    console.log('ℹ️ [CRON] No active users found.');
    return { successCount: 0, failCount: 0, inquiryCount: 0, templateCount: 0, total: 0, targetDates: dates };
  }

  const eligibleForAutoPlan = users.filter((u) => u.is_admin === 1 || u.is_active_recently === 1);
  const inactiveUsers = users.filter((u) => u.is_admin === 0 && u.is_active_recently === 0);

  console.log(
    `👥 [CRON] Total users: ${users.length} | Auto-plan (active in app last 7 days): ${eligibleForAutoPlan.length} | Inactive (safeguarded, inquiry only): ${inactiveUsers.length}`
  );

  let successCount = 0;
  let failCount = 0;
  let inquiryCount = 0;
  let templateCount = 0;

  // 1. Generate full AI weekly workout plan for athletes active in the app
  for (const user of eligibleForAutoPlan) {
    try {
      console.log(`⚡ [CRON] Generating weekly plan for ${user.username} (ID: ${user.id}, Tier: ${user.subscription_tier || 'free'})...`);
      await generateWeeklyPlanForUser(user.id, dates, { poolType: 'common' });
      successCount++;
      console.log(`✅ [CRON] Successfully scheduled coming week for ${user.username}`);

      // Rate limit pacing to avoid Gemini API quota bursts
      await new Promise((r) => setTimeout(r, 450));
    } catch (err) {
      failCount++;
      console.error(`❌ [CRON] Error generating plan for ${user.username} (ID: ${user.id}):`, err.message);
    }
  }

  // 2. Safeguard for inactive users (any tier): Skip heavy LLM generation, send coach inquiry notification
  for (const user of inactiveUsers) {
    try {
      let templateResult = { written: false };
      try {
        templateResult = await generateTemplatePlanForUser(user.id, dates);
        if (templateResult.written) templateCount++;
      } catch (tplErr) {
        console.error(`❌ [CRON] Template plan failed for ${user.username} (ID: ${user.id}):`, tplErr.message);
      }
      console.log(`📨 [CRON] Sending weekly plan inquiry notification to inactive user ${user.username} (ID: ${user.id})...`);
      await sendInactiveUserWeeklyPlanInquiry(user, { hasTemplatePlan: Boolean(templateResult.written) });
      inquiryCount++;
    } catch (err) {
      console.error(`❌ [CRON] Error sending plan inquiry to ${user.username} (ID: ${user.id}):`, err.message);
    }
  }

  console.log(
    `🏁 [CRON] Completed Sunday weekly workout planning. Plans generated: ${successCount}, Failures: ${failCount}, Template weeks: ${templateCount}, Inquiries sent: ${inquiryCount}`
  );

  return {
    successCount,
    failCount,
    inquiryCount,
    templateCount,
    total: users.length,
    autoPlanned: eligibleForAutoPlan.length,
    safeguarded: inactiveUsers.length,
    targetDates: dates,
  };
}

/**
 * Calculates planned workout duration in minutes safely without mistaking
 * distance annotations (like 200m warmup) for minutes.
 */
function calculateWorkoutDurationMinutes(workout) {
  if (!workout) return 45;

  // 1. Direct planned duration if provided
  if (typeof workout.duration === 'number' && workout.duration > 0) {
    return Math.round(workout.duration);
  }
  if (typeof workout.duration_minutes === 'number' && workout.duration_minutes > 0) {
    return Math.round(workout.duration_minutes);
  }
  if (typeof workout.duration === 'string') {
    const dMatch = workout.duration.match(/^(\d+)\s*(?:min|mins|minute|minutes)?$/i);
    if (dMatch) return parseInt(dMatch[1], 10);
  }

  // 2. Title matching: e.g. "30-Min EVF & Pull Technique" or "45 min Tempo"
  const title = workout.title || workout.description || '';
  const titleMatch = title.match(/\b(\d+)\s*(?:-|–|\s)?(?:min|mins|minute|minutes)\b/i);
  if (titleMatch) {
    return parseInt(titleMatch[1], 10);
  }

  // 3. Structured steps calculation (including distance steps e.g. 200m or 1500m swim)
  if (workout.steps_json) {
    try {
      const steps = typeof workout.steps_json === 'string' ? JSON.parse(workout.steps_json) : workout.steps_json;
      if (Array.isArray(steps) && steps.length > 0) {
        let totalMins = 0;
        const sport = String(workout.sport || workout.type || '').toUpperCase();

        const parseSteps = (sArr) => {
          if (!Array.isArray(sArr)) return;
          for (const s of sArr) {
            if (s.type === 'repeat' && s.iterations && Array.isArray(s.steps)) {
              let iterMins = 0;
              for (const rs of s.steps) {
                const cVal = Number(rs.condition_value) || 0;
                if (rs.condition_type === 'time_sec') {
                  iterMins += cVal / 60;
                } else if (rs.condition_type === 'time') {
                  iterMins += (cVal > 180 && cVal % 30 === 0) ? cVal / 60 : cVal;
                } else if (rs.condition_type === 'distance') {
                  if (sport === 'SWIM') iterMins += (cVal / 100) * 1.8;
                  else if (sport === 'BIKE' || sport === 'RIDE') iterMins += (cVal / 1000) * 2;
                  else iterMins += (cVal / 1000) * 5;
                } else if (rs.condition_type === 'distance_km') {
                  if (sport === 'BIKE' || sport === 'RIDE') iterMins += cVal * 2;
                  else iterMins += cVal * 5;
                }
              }
              totalMins += iterMins * (Number(s.iterations) || 1);
            } else {
              const cVal = Number(s.condition_value) || 0;
              if (s.condition_type === 'time_sec') {
                totalMins += cVal / 60;
              } else if (s.condition_type === 'time') {
                totalMins += (cVal > 180 && cVal % 30 === 0) ? cVal / 60 : cVal;
              } else if (s.condition_type === 'distance') {
                if (sport === 'SWIM') totalMins += (cVal / 100) * 1.8;
                else if (sport === 'BIKE' || sport === 'RIDE') totalMins += (cVal / 1000) * 2;
                else totalMins += (cVal / 1000) * 5;
              } else if (s.condition_type === 'distance_km') {
                if (sport === 'BIKE' || sport === 'RIDE') totalMins += cVal * 2;
                else totalMins += cVal * 5;
              } else if (s.steps && Array.isArray(s.steps)) {
                parseSteps(s.steps);
              }
            }
          }
        };
        parseSteps(steps);
        if (totalMins > 0) return Math.round(totalMins);
      }
    } catch (e) {}
  }

  // 4. Details / notes matching: look for explicit "30 min" or "30 mins", NOT meters like "200m"
  const details = workout.details || workout.notes || '';
  if (details) {
    const detailsMatch = details.match(/\b(\d+)\s*(?:min|mins|minute|minutes)\b/i);
    if (detailsMatch) {
      return parseInt(detailsMatch[1], 10);
    }
  }

  return 45;
}

module.exports = {
  getUpcomingWeekMonToSun,
  getCurrentWeekMonToSun,
  calculateUserFitnessMetrics,
  calculateWorkoutDurationMinutes,
  buildFallbackPlan,
  buildTemplatePlan,
  generateTemplatePlanForUser,
  generateWeeklyPlanForUser,
  sendInactiveUserWeeklyPlanInquiry,
  runWeeklyWorkoutPlanningJob,
};
