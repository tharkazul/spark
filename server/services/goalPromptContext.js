const fs = require("fs");
const path = require("path");
const db = require("./db");

// Cache prompt template file contents
let cachedPrompts = null;

function loadPromptTemplates() {
  if (cachedPrompts) return cachedPrompts;

  const promptsDir = path.join(__dirname, "../prompts");
  const readSafe = (fileName) => {
    try {
      const fullPath = path.join(promptsDir, fileName);
      if (fs.existsSync(fullPath)) {
        return fs.readFileSync(fullPath, "utf-8").trim();
      }
    } catch (e) {
      console.warn(`[goalPromptContext] Could not read prompt file ${fileName}:`, e.message);
    }
    return "";
  };

  cachedPrompts = {
    hyrox: readSafe("hyrox_training_prompt.md"),
    triathlon: readSafe("triathlon_training_prompt.md"),
    running: readSafe("running_training_prompt.md"),
  };

  return cachedPrompts;
}

/**
 * Detects the athlete's primary athletic discipline based on active goals, milestones,
 * target event, and athlete context.
 *
 * @param {object} user - User row or context object
 * @param {Array} milestones - Array of milestone rows for the user
 * @returns {'hyrox' | 'triathlon' | 'running' | 'general'}
 */
function detectAthleteGoalDiscipline(user = {}, milestones = []) {
  const safeList = Array.isArray(milestones) ? milestones : [];
  
  // 1. Identify primary milestone (is_main = 1)
  const mainMilestone = safeList.find((m) => m && (m.is_main === 1 || m.is_main === true || m.isMain === true));
  
  // 2. Identify upcoming race milestone if no main set
  const todayStr = new Date().toISOString().slice(0, 10);
  const upcomingRace = safeList.find(
    (m) => m && m.date && m.date >= todayStr && (m.goal_type || m.goalType || "race") === "race"
  );

  // Candidate sources in order of specificity
  const candidateTexts = [
    mainMilestone?.name,
    upcomingRace?.name,
    safeList[0]?.name,
    user?.target_event,
    user?.targetEvent,
    user?.athlete_context,
    user?.athleteContext,
  ].filter(Boolean);

  const combinedText = candidateTexts.join(" ").toLowerCase();

  // Pattern definitions
  const hyroxPattern = /\b(hyrox|dekapack|deka\s*fit)\b/i;
  const triathlonPattern = /\b(triathlon|ironman|70\.3|140\.6|triathlete|duathlon|swimbikerun|swim-bike-run)\b/i;
  const runningPattern = /\b(marathon|half\s*marathon|10k|5k|trail\s*run|ultramarathon|ultra\s*run|runner)\b/i;

  // Primary event name check first
  const primaryName = (mainMilestone?.name || user?.target_event || user?.targetEvent || "").toLowerCase();
  if (primaryName) {
    if (hyroxPattern.test(primaryName)) return "hyrox";
    if (triathlonPattern.test(primaryName)) return "triathlon";
    if (runningPattern.test(primaryName)) return "running";
  }

  // Combined context check
  if (hyroxPattern.test(combinedText)) return "hyrox";
  if (triathlonPattern.test(combinedText)) return "triathlon";
  if (runningPattern.test(combinedText)) return "running";

  // Check functional / hybrid athlete context
  if (/functional\s*fitness|hybrid\s*athlete/i.test(combinedText)) {
    return "hyrox";
  }

  return "general";
}

/**
 * Returns the modular, goal-dependent prompt context block for the given discipline.
 *
 * @param {'hyrox' | 'triathlon' | 'running' | 'general'} discipline
 * @param {object} options
 * @returns {string} Targeted prompt context to inject into system prompt
 */
function getGoalDependentPromptContext(discipline = "general", options = {}) {
  const templates = loadPromptTemplates();

  const baseHeader = `GOAL-SPECIFIC TRAINING & DRILL PRESCRIPTION RULES:
MANDATORY GRANULARITY DIRECTIVE:
Every workout's 'details' field in the JSON is the athlete-facing coaching prescription and MUST NEVER be a basic one-liner like "intervals", "easy run", or "tempo session". 
You MUST provide explicit drill breakdowns, equipment cues, cadence targets, and biomechanical focus in 'details'.
(Machine-readable step intervals go into 'steps_json', while rich, human-readable technique cues, drills, and equipment instructions go into 'details').`;

  if (discipline === "hyrox") {
    const customContent = templates.hyrox || `
- Hyrox Compromised Running: Prescribe drills where running occurs immediately following heavy functional work (e.g. 50m Heavy Sled Push into 400m surge run at race pace; weighted vest incline treadmill walk into flat threshold run).
- Station Technique & Isolation: Include specific cues and sets for SkiErg (tall-kneeling band pull-downs), Burpee Broad Jumps (low-hip bounds), Sled Pulls (quad drive), Farmers Carries (+ dead hangs), Sandbag Lunges (+ jump squats), and Wall Balls (descent catch EMOM).
- Session Details: Detail dynamic warm-up mobility (world's greatest stretch, ankle rocks), primary work (exact kg and pacing), functional accessories, and cool-down.`;

    return `\n${baseHeader}

ATHLETE DISCIPLINE: HYROX & FUNCTIONAL ENDURANCE
${customContent}\n`;
  }

  if (discipline === "triathlon") {
    const customContent = templates.triathlon || `
- Swim Drills & Equipment: Actively prescribe pull buoy, hand paddles, fins, and kickboard in workout details. Detail EVF (early vertical forearm) high-elbow catch, 4x50m catch-up drill w/ float, hypoxic breathing, and open-water sighting practice.
- Bike Drills & Cadence: Detail over-under intervals (e.g., 2m @ 95% FTP / 85 rpm + 1m @ 105% FTP / 95 rpm standing climb), single-leg pedaling isolation drills (45s per leg), and aero-position adaptation (locked in aero bars at 90 rpm).
- Run Drills & Brick Transitions: Prescribe neuromuscular strides, running form drills (high knees, butt kicks, A-skips, B-skips), and direct bike-to-run (T2) brick transitions.
- Intra-Workout Fueling: Specify explicit intra-session hydration and carbohydrate intake (g/hr) in the workout details.`;

    return `\n${baseHeader}

ATHLETE DISCIPLINE: TRIATHLON & IRONMAN (SWIM / BIKE / RUN)
${customContent}\n`;
  }

  if (discipline === "running") {
    const customContent = templates.running || `
- Running Form & Mechanics: Prescribe running form drills (A-skips, butt kicks / heel recovery, strides).
- Biomechanical Cues in Details: Explicitly cue "high heels" (rapid heel pull directly under glutes for compact swing phase), cadence (175-185 spm), tall posture, and midfoot landing.
- Session Details: Specify pre-run dynamic mobility (leg swings, ankle dorsiflexion), structured interval pacing, and post-run strides.`;

    return `\n${baseHeader}

ATHLETE DISCIPLINE: ENDURANCE RUNNING
${customContent}\n`;
  }

  // General endurance athlete fallback
  return `\n${baseHeader}

ATHLETE DISCIPLINE: GENERAL ENDURANCE & FUNCTIONAL FITNESS
- Biomechanical & Technique Focus: In workout 'details', never write generic descriptions. Always prescribe explicit warm-up mobility, cadence cues (e.g., 175-185 spm for runs, 85-95 rpm for rides), form mechanics (e.g., tall posture, relaxed shoulders, heel recovery), and session focus.\n`;
}

/**
 * Asynchronously loads an athlete's milestones and context from the database,
 * determines their discipline, and returns the goal-dependent prompt block.
 *
 * @param {number|string} userId
 * @param {object} [fallbackUser] - Optional pre-loaded user object
 * @returns {Promise<{ discipline: string, promptContext: string, goalName: string, goalDate: string }>}
 */
async function getUserGoalPromptContext(userId, fallbackUser = null) {
  return new Promise((resolve) => {
    if (!userId) {
      const discipline = detectAthleteGoalDiscipline(fallbackUser || {}, []);
      return resolve({
        discipline,
        promptContext: getGoalDependentPromptContext(discipline),
        goalName: fallbackUser?.target_event || fallbackUser?.targetEvent || "Endurance Training",
        goalDate: fallbackUser?.event_date || fallbackUser?.eventDate || "",
      });
    }

    db.all(
      `SELECT name, date, is_main, goal_type, target_mode, target_value 
       FROM milestones 
       WHERE user_id = ? 
       ORDER BY is_main DESC, date ASC`,
      [userId],
      (err, milestoneRows) => {
        const milestones = !err && milestoneRows ? milestoneRows : [];

        if (fallbackUser && (fallbackUser.athlete_context || fallbackUser.target_event)) {
          const discipline = detectAthleteGoalDiscipline(fallbackUser, milestones);
          const mainM = milestones.find((m) => m.is_main === 1) || milestones[0];
          return resolve({
            discipline,
            promptContext: getGoalDependentPromptContext(discipline),
            goalName: mainM?.name || fallbackUser.target_event || fallbackUser.targetEvent || "Endurance Goal",
            goalDate: mainM?.date || fallbackUser.event_date || fallbackUser.eventDate || "",
          });
        }

        // If fallbackUser not provided or incomplete, fetch user row
        db.get(
          `SELECT id, athlete_context, target_event, event_date FROM users WHERE id = ?`,
          [userId],
          (uErr, userRow) => {
            const user = userRow || fallbackUser || {};
            const discipline = detectAthleteGoalDiscipline(user, milestones);
            const mainM = milestones.find((m) => m.is_main === 1) || milestones[0];

            resolve({
              discipline,
              promptContext: getGoalDependentPromptContext(discipline),
              goalName: mainM?.name || user.target_event || "Endurance Goal",
              goalDate: mainM?.date || user.event_date || "",
            });
          }
        );
      }
    );
  });
}

module.exports = {
  loadPromptTemplates,
  detectAthleteGoalDiscipline,
  getGoalDependentPromptContext,
  getUserGoalPromptContext,
};
