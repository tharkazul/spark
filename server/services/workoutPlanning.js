const db = require("./db");
const { generateWithFallback } = require("./ai");
const { sendSSEEvent } = require("./sse");
const { sendPushToUser } = require("./pushNotificationService");
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
function buildFallbackPlan(dates, primarySport = 'Run', userLang = 'en') {
  const isDutch = userLang === 'nl';
  const isGerman = userLang === 'de';
  const isSpanish = userLang === 'es';
  const isFrench = userLang === 'fr';

  const sport = primarySport && primarySport !== 'Rest' ? primarySport : 'Run';

  return [
    {
      date: dates[0],
      sport: sport,
      description: isDutch ? 'Aerobe Basisduur' : isGerman ? 'Grundlagen-Dauerlauf' : isSpanish ? 'Base Aeróbica' : isFrench ? 'Endurance Fondamentale' : 'Aerobic Base Foundation',
      target_rooka: 45,
      details: isDutch ? 'Rustige duurtraining op praattempo (Zone 2).' : 'Steady conversational pace endurance training (Zone 2).',
      steps_json: '[]',
    },
    {
      date: dates[1],
      sport: 'Strength',
      description: isDutch ? 'Core & Spierversterking' : isGerman ? 'Core & Rumpfaufbau' : isSpanish ? 'Fuerza y Core' : isFrench ? 'Renforcement Musculaire' : 'Core & Kinetic Chain Strength',
      target_rooka: 35,
      details: isDutch ? 'Focus op heupstabiliteit, core en neuromusculaire controle.' : 'Focus on hip stability, core activation, and postural control.',
      steps_json: '[]',
    },
    {
      date: dates[2],
      sport: 'Rest',
      description: isDutch ? 'Hersteldag & Mobiliteit' : isGerman ? 'Regeneration & Mobilität' : isSpanish ? 'Recuperación Activa' : isFrench ? 'Récupération & Mobilité' : 'Active Recovery & Mobility',
      target_rooka: 0,
      details: isDutch ? 'Lichte wandeling, hydratatie en spierherstel.' : 'Gentle walking, hydration, and muscle tissue recovery.',
      steps_json: '[]',
    },
    {
      date: dates[3],
      sport: sport,
      description: isDutch ? 'Tempo Interval Training' : isGerman ? 'Tempo-Intervalle' : isSpanish ? 'Intervalos de Tempo' : isFrench ? 'Intervalles Tempo' : 'Threshold Tempo Intervals',
      target_rooka: 60,
      details: isDutch ? 'Progressieve intervals rond lactaatdrempel.' : 'Controlled threshold intervals with full recoveries.',
      steps_json: '[]',
    },
    {
      date: dates[4],
      sport: 'Rest',
      description: isDutch ? 'Volledige Rustdag' : isGerman ? 'Ruhetag' : isSpanish ? 'Día de Descanso' : isFrench ? 'Repos Total' : 'Rest & Tissue Adaptation',
      target_rooka: 0,
      details: isDutch ? 'Voldoende slaap en herstel ter voorbereiding op het weekend.' : 'Prioritize deep sleep and restorative nutrition before the weekend.',
      steps_json: '[]',
    },
    {
      date: dates[5],
      sport: sport,
      description: isDutch ? 'Lange Duurtraining' : isGerman ? 'Langer Dauerlauf' : isSpanish ? 'Tirada Larga Aeróbica' : isFrench ? 'Sortie Longue' : 'Long Aerobic Progression',
      target_rooka: 75,
      details: isDutch ? 'Gestage lange afstand met focus op hydratatie en energie-inname.' : 'Steady distance building aerobic capacity and pacing discipline.',
      steps_json: '[]',
    },
    {
      date: dates[6],
      sport: 'Rest',
      description: isDutch ? 'Weekevaluatie & Rust' : isGerman ? 'Wochenrückblick & Erholung' : isSpanish ? 'Descanso y Evaluación' : isFrench ? 'Repos & Bilan' : 'Weekly Reflection & Rest',
      target_rooka: 0,
      details: isDutch ? 'Rustig afronden van de trainingsweek.' : 'Light mobility, foam rolling, and preparing for the upcoming week.',
      steps_json: '[]',
    },
  ];
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
              gender, language, training_availability, cycle_tracking_enabled 
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
        .map(([day, data]) => `- ${day.charAt(0).toUpperCase() + day.slice(1)}: ${data.status} (Max minutes: ${data.max_minutes})`)
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

  // Language mapping
  const langMap = {
    nl: 'Dutch (Nederlands)',
    de: 'German (Deutsch)',
    es: 'Spanish (Español)',
    fr: 'French (Français)',
    en: 'English'
  };
  const targetLanguageName = langMap[user.language] || 'English';

  const coachName = user.coach_name || 'Rooka';
  let coachToneText = user.coach_tone || 'Empathetic but demanding elite endurance coach.';
  if (user.coach_tone === 'custom' || user.coach_tone === 'Configure own coach') {
    coachToneText = user.coach_context ? `Custom tone: ${user.coach_context}` : 'Custom coach persona';
  }

  const systemPrompt = `You are Coach ${coachName}, an elite endurance and athletic performance coach.
Tone: ${coachToneText}
${user.coach_context ? `Coach Custom Context & Rules: ${user.coach_context}` : ''}
Athlete Context: ${user.athlete_context || "General endurance athlete"}
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

${goalContext.promptContext}

CRITICAL RULES:
0. LANGUAGE DIRECTIVE: All natural language workout descriptions and details MUST be written fluently in ${targetLanguageName}.
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
4. MUSCLE LOAD: Any group listed HIGH is heavily loaded. Do not schedule consecutive sessions overloading that group.
5. INJURIES: Respect active niggles and substitute lower impact activities where necessary.
6. TARGETS & MEASUREMENTS: Metric units (km, kg, km/h, meters). Distance condition values must be in pure meters.
7. STRENGTH: For Strength workouts, exercises go into the 'steps_json' array with condition_type 'reps', weight (kg), exerciseName, and rest steps.
8. WORKOUT DETAILS & PRESCRIPTION GRANULARITY (CRITICAL):
   - Every workout's 'details' field is the primary athlete-facing coaching prescription.
   - NEVER write basic or vague one-liners like "intervals", "easy run", or "tempo session".
   - You MUST prescribe concrete technique cues, drills, equipment (e.g. pull buoy & hand paddles, aero bars, SkiErg, sled push), specific movement focus (e.g. "focus on high heels / rapid heel recovery", "early vertical forearm EVF catch", "single-leg pedaling"), dynamic mobility warm-ups, and session fueling notes.
   - Note: While machine-readable structured intervals go into 'steps_json', the rich human-readable drills, equipment, and technique instructions go into 'details'!
9. FORMAT: You must append a JSON code block at the very end of your response containing the array of 7 days:
\`\`\`json
[
  {
    "date": "${dates[0]}",
    "sport": "Run",
    "description": "Aerobic Base & Cadence Drill",
    "target_rooka": 45,
    "details": "Warm-up: 2x10 ankle rocks, 3x30m A-skips and butt kicks cueing rapid heel recovery (high heels). Main set: 45 min steady Zone 2 holding 175-180 spm cadence. Cool-down: 4x60m relaxed strides + calf mobility.",
    "steps_json": "[{\\"type\\": \\"warmup\\", \\"condition_type\\": \\"time\\", \\"condition_value\\": 10, \\"target_type\\": \\"heart.rate.zone\\", \\"zone\\": 2}]"
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
      poolType
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
    const primarySport = user.athlete_context && user.athlete_context.toLowerCase().includes('cycl') ? 'Bike'
      : user.athlete_context && user.athlete_context.toLowerCase().includes('swim') ? 'Swim' : 'Run';
    planData = buildFallbackPlan(dates, primarySport, user.language);
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

  // 8. Atomic Database Write:
  // Remove existing coach-generated workouts for these dates, leaving user-created workouts intact
  await new Promise((resolve) => {
    const placeholders = dates.map(() => '?').join(',');
    db.run(
      `DELETE FROM micro_plan 
       WHERE user_id = ? AND date IN (${placeholders}) AND (source = 'coach' OR source IS NULL)`,
      [userId, ...dates],
      (err) => {
        if (err) console.error(`[WeeklyPlan] Error clearing prior plan for user ${userId}:`, err);
        resolve();
      }
    );
  });

  const insertStmt = db.prepare(`
    INSERT INTO micro_plan (user_id, date, sport, description, target_rooka, details, steps_json, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'coach')
  `);

  sanitizedPlan.forEach((day) => {
    insertStmt.run(
      userId,
      day.date,
      day.sport,
      day.description,
      day.target_rooka,
      day.details,
      day.steps_json
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
    title: user.language === 'nl' ? '📅 Nieuw trainingsschema klaar' : '📅 Weekly Training Plan Ready',
    body: user.language === 'nl'
      ? `Coach ${coachName} heeft je trainingen voor komende week (ma-zo) klaargezet.`
      : `Coach ${coachName} has prepared your workouts for the coming week (Mon–Sun).`,
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
 * Weekly Scheduled Cron Job:
 * Runs on Sunday for all active accounts on the common token budget.
 */
async function runWeeklyWorkoutPlanningJob(options = {}) {
  console.log('🗓️ [CRON] Starting Sunday weekly workout planning job for all accounts...');
  const { mondayStr, sundayStr, dates } = getUpcomingWeekMonToSun();
  console.log(`📅 [CRON] Generating week: ${mondayStr} (Monday) to ${sundayStr} (Sunday)`);

  const users = await new Promise((resolve) => {
    db.all(
      `SELECT id, username FROM users WHERE deleted_at IS NULL`,
      [],
      (err, rows) => resolve(err || !rows ? [] : rows)
    );
  });

  if (!users || users.length === 0) {
    console.log('ℹ️ [CRON] No active users found.');
    return { successCount: 0, failCount: 0, total: 0, targetDates: dates };
  }

  console.log(`👥 [CRON] Found ${users.length} active account(s) to process on Common token budget.`);
  let successCount = 0;
  let failCount = 0;

  for (const user of users) {
    try {
      console.log(`⚡ [CRON] Generating weekly plan for ${user.username} (ID: ${user.id})...`);
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

  console.log(`🏁 [CRON] Completed weekly workout planning. Success: ${successCount}, Failures: ${failCount}`);
  return {
    successCount,
    failCount,
    total: users.length,
    targetDates: dates,
  };
}

module.exports = {
  getUpcomingWeekMonToSun,
  calculateUserFitnessMetrics,
  buildFallbackPlan,
  generateWeeklyPlanForUser,
  runWeeklyWorkoutPlanningJob,
};
