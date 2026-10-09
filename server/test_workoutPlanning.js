const assert = require("assert");
const {
  getUpcomingWeekMonToSun,
  getCurrentWeekMonToSun,
  buildFallbackPlan,
} = require("./services/workoutPlanning");

console.log("🏃 Running Workout Planning unit tests...\n");

// Test 1: getUpcomingWeekMonToSun on a Sunday
{
  // 2026-09-13 is a Sunday
  const sunday = new Date("2026-09-13T18:00:00Z");
  const { mondayStr, sundayStr, dates } = getUpcomingWeekMonToSun(sunday);

  assert.strictEqual(dates.length, 7, "Must produce exactly 7 dates");
  assert.strictEqual(mondayStr, "2026-09-14", "Monday must be the day after Sunday");
  assert.strictEqual(sundayStr, "2026-09-20", "Sunday must be 7 days after Monday");
  assert.deepStrictEqual(dates, [
    "2026-09-14",
    "2026-09-15",
    "2026-09-16",
    "2026-09-17",
    "2026-09-18",
    "2026-09-19",
    "2026-09-20",
  ], "Dates must match Monday through Sunday");
  console.log("✅ Test 1 Passed: Sunday correctly yields upcoming Mon-Sun");
}

// Test 1b: getCurrentWeekMonToSun on a Monday and Sunday
{
  // 2026-09-28 is a Monday
  const monday = new Date("2026-09-28T09:00:00Z");
  const currentWeek = getCurrentWeekMonToSun(monday);
  assert.strictEqual(currentWeek.mondayStr, "2026-09-28");
  assert.strictEqual(currentWeek.sundayStr, "2026-10-04");

  // 2026-10-04 is Sunday of that same week
  const sunday = new Date("2026-10-04T20:00:00Z");
  const sameWeek = getCurrentWeekMonToSun(sunday);
  assert.strictEqual(sameWeek.mondayStr, "2026-09-28");
  assert.strictEqual(sameWeek.sundayStr, "2026-10-04");
  console.log("✅ Test 1b Passed: getCurrentWeekMonToSun correctly yields current Mon-Sun");
}

// Test 2: getUpcomingWeekMonToSun on a Monday
{
  // 2026-09-14 is a Monday
  const monday = new Date("2026-09-14T10:00:00Z");
  const { mondayStr, sundayStr, dates } = getUpcomingWeekMonToSun(monday);

  assert.strictEqual(dates.length, 7);
  assert.strictEqual(mondayStr, "2026-09-21", "Upcoming Monday from Monday is +7 days");
  assert.strictEqual(sundayStr, "2026-09-27");
  console.log("✅ Test 2 Passed: Monday correctly yields next week Mon-Sun");
}

// Test 3: getUpcomingWeekMonToSun on a Wednesday
{
  // 2026-09-16 is a Wednesday
  const wednesday = new Date("2026-09-16T15:30:00Z");
  const { mondayStr, sundayStr, dates } = getUpcomingWeekMonToSun(wednesday);

  assert.strictEqual(dates.length, 7);
  assert.strictEqual(mondayStr, "2026-09-21", "Upcoming Monday from Wednesday is in 5 days");
  assert.strictEqual(sundayStr, "2026-09-27");
  console.log("✅ Test 3 Passed: Wednesday correctly yields upcoming Mon-Sun");
}

// Test 4: getUpcomingWeekMonToSun on a Saturday
{
  // 2026-09-19 is a Saturday
  const saturday = new Date("2026-09-19T22:00:00Z");
  const { mondayStr, sundayStr, dates } = getUpcomingWeekMonToSun(saturday);

  assert.strictEqual(dates.length, 7);
  assert.strictEqual(mondayStr, "2026-09-21", "Upcoming Monday from Saturday is in 2 days");
  assert.strictEqual(sundayStr, "2026-09-27");
  console.log("✅ Test 4 Passed: Saturday correctly yields upcoming Mon-Sun");
}

// Test 5: Fallback plan generation
{
  const dates = [
    "2026-09-14",
    "2026-09-15",
    "2026-09-16",
    "2026-09-17",
    "2026-09-18",
    "2026-09-19",
    "2026-09-20",
  ];
  const planEn = buildFallbackPlan(dates, "Run", "en");
  assert.strictEqual(planEn.length, 7);
  assert.strictEqual(planEn[0].sport, "Run");
  assert.strictEqual(planEn[0].date, "2026-09-14");
  assert.strictEqual(planEn[2].sport, "Rest");
  assert.strictEqual(planEn[2].target_rooka, 0);

  const planNl = buildFallbackPlan(dates, "Bike", "nl");
  assert.strictEqual(planNl.length, 7);
  assert.strictEqual(planNl[0].sport, "Bike");
  assert.ok(planNl[0].description.includes("Aerobe Basisduur"));

  console.log("✅ Test 5 Passed: Fallback plan produces valid 7-day schedule with language localization");
}

// Test 6: Verify exports
{
  const service = require("./services/workoutPlanning");
  assert.strictEqual(typeof service.getUpcomingWeekMonToSun, "function");
  assert.strictEqual(typeof service.calculateUserFitnessMetrics, "function");
  assert.strictEqual(typeof service.buildFallbackPlan, "function");
  assert.strictEqual(typeof service.generateWeeklyPlanForUser, "function");
  assert.strictEqual(typeof service.sendInactiveUserWeeklyPlanInquiry, "function");
  assert.strictEqual(typeof service.runWeeklyWorkoutPlanningJob, "function");
  console.log("✅ Test 6 Passed: workoutPlanning service exports all required methods");
}

// Test 7: Verify sendInactiveUserWeeklyPlanInquiry inserts coach chat inquiry
(async () => {
  const db = require("./services/db");
  const { sendInactiveUserWeeklyPlanInquiry } = require("./services/workoutPlanning");

  const testUser = {
    id: 987654,
    username: "TestAthlete",
    coach_name: "Coach Rooka",
    language: "nl",
  };

  await sendInactiveUserWeeklyPlanInquiry(testUser);

  const insertedMessage = await new Promise((resolve) => {
    db.get(
      `SELECT content, role, mood FROM chat_history WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
      [testUser.id],
      (err, row) => resolve(row)
    );
  });

  assert.ok(insertedMessage, "Message should be inserted in chat_history");
  assert.strictEqual(insertedMessage.role, "coach");
  assert.strictEqual(insertedMessage.mood, "friendly");
  assert.ok(
    insertedMessage.content.includes("TestAthlete") && insertedMessage.content.includes("schema"),
    "Message should be localized in Dutch and mention athlete name"
  );

  // Clean up
  db.run(`DELETE FROM chat_history WHERE user_id = ?`, [testUser.id]);
  console.log("✅ Test 7 Passed: sendInactiveUserWeeklyPlanInquiry sends personalized, localized coach inquiry");

  // Test 8: Fix the "2 min swim" bug: A 30-minute swim with "200m warm-up" in notes must yield 30 mins, never 2 mins
  {
    const { calculateWorkoutDurationMinutes } = require("./services/workoutPlanning");

    // Case A: Title has "30-Min EVF & Pull Technique" and notes mention "200m warm-up"
    const swimA = {
      sport: "Swim",
      title: "30-Min EVF & Pull Technique",
      details: "200m warm-up on easy pace, then 6x100m EVF drills, 200m cool-down.",
      steps_json: "[]",
    };
    const durA = calculateWorkoutDurationMinutes(swimA);
    assert.strictEqual(durA, 30, `Expected 30 mins for swim with 30-Min title, but got ${durA}`);

    // Case B: Explicit planned duration provided
    const swimB = {
      sport: "Swim",
      title: "EVF & Pull Technique",
      duration: 30,
      details: "200m warm-up with pull buoy.",
    };
    const durB = calculateWorkoutDurationMinutes(swimB);
    assert.strictEqual(durB, 30, `Expected 30 mins for explicit duration, but got ${durB}`);

    // Case C: Details has "30 min swim" and "200m warm-up"
    const swimC = {
      sport: "Swim",
      title: "Technique Focus",
      details: "Planned 30 min swim session starting with 200m warm-up.",
    };
    const durC = calculateWorkoutDurationMinutes(swimC);
    assert.strictEqual(durC, 30, `Expected 30 mins from details, but got ${durC}`);

    // Case D: Distance steps in swim (200m warmup + 1000m main + 200m cooldown)
    const swimD = {
      sport: "Swim",
      title: "Swim Aerobic",
      steps_json: JSON.stringify([
        { type: "warmup", condition_type: "distance", condition_value: 200 },
        { type: "interval", condition_type: "distance", condition_value: 1000 },
        { type: "cooldown", condition_type: "distance", condition_value: 200 },
      ]),
    };
    const durD = calculateWorkoutDurationMinutes(swimD);
    assert.ok(durD >= 20 && durD <= 35, `Expected ~25 mins for 1400m swim, got ${durD}`);
    assert.notStrictEqual(durD, 2, "Swim must never mistakenly calculate as 2 mins!");

    console.log("✅ Test 8 Passed: 30-minute swim duration correctly resolved without 2-min bug");
  }

  // Test 9: parseAvailability correctly identifies dedicated rest days
  {
    const { parseAvailability } = require("./services/workoutPlanning");
    const rawTharakaAvailability = {
      Mon: { available: true, maxMinutes: 60 },
      Tue: { available: false, maxMinutes: 0 },
      Wed: { available: true, maxMinutes: 90 },
      Thu: { available: true, maxMinutes: 60 },
      Fri: { available: true, maxMinutes: 75 },
      Sat: { available: true, maxMinutes: 180 },
      Sun: { available: false, maxMinutes: 0 },
    };
    const parsed = parseAvailability(rawTharakaAvailability);

    assert.strictEqual(parsed.sun.available, false, "Sunday must be marked as blocked/rest");
    assert.strictEqual(parsed.tue.available, false, "Tuesday must be marked as blocked/rest");
    assert.strictEqual(parsed.mon.available, true, "Monday must be available");
    assert.strictEqual(parsed.sat.available, true, "Saturday must be available");
    assert.strictEqual(parsed.sat.maxMinutes, 180, "Saturday must have 180 maxMinutes");
    console.log("✅ Test 9 Passed: parseAvailability correctly handles dedicated rest days (0m / available: false)");
  }

  // Test 10: findAvailabilityViolations flags workouts scheduled on dedicated rest days
  {
    const { parseAvailability, findAvailabilityViolations } = require("./services/workoutPlanning");
    const availMap = parseAvailability({
      Tue: { available: false, maxMinutes: 0 },
      Sun: { available: false, maxMinutes: 0 },
    });
    const draftPlan = [
      { date: "2026-10-05", sport: "Run", description: "Easy Run" },
      { date: "2026-10-06", sport: "Run", description: "Tempo Run on Tuesday" }, // VIOLATION
      { date: "2026-10-07", sport: "Rest", description: "Rest" },
      { date: "2026-10-08", sport: "Run", description: "Intervals" },
      { date: "2026-10-09", sport: "Strength", description: "Core" },
      { date: "2026-10-10", sport: "Run", description: "Recovery Run" },
      { date: "2026-10-11", sport: "Run", description: "Aerobic Long Run with Threshold" }, // VIOLATION
    ];

    const violations = findAvailabilityViolations(draftPlan, availMap);
    assert.strictEqual(violations.length, 2, "Must detect exactly 2 rest day violations (Tue and Sun)");
    assert.strictEqual(violations[0].date, "2026-10-06");
    assert.strictEqual(violations[1].date, "2026-10-11");
    console.log("✅ Test 10 Passed: findAvailabilityViolations identifies workouts scheduled on dedicated rest days");
  }

  // Test 11: repairAvailabilityViolations deterministically enforces Rest on Sunday & relocates sessions
  {
    const { parseAvailability, repairAvailabilityViolations } = require("./services/workoutPlanning");
    const availMap = parseAvailability({
      Mon: { available: true, maxMinutes: 60 },
      Tue: { available: false, maxMinutes: 0 },
      Wed: { available: true, maxMinutes: 90 },
      Thu: { available: true, maxMinutes: 60 },
      Fri: { available: true, maxMinutes: 75 },
      Sat: { available: true, maxMinutes: 180 },
      Sun: { available: false, maxMinutes: 0 },
    });
    const dates = [
      "2026-10-05", // Mon
      "2026-10-06", // Tue (Rest)
      "2026-10-07", // Wed
      "2026-10-08", // Thu
      "2026-10-09", // Fri
      "2026-10-10", // Sat
      "2026-10-11", // Sun (Rest)
    ];

    const draftPlanWithViolations = [
      { date: "2026-10-05", sport: "Run", description: "Easy Run", target_rooka: 45 },
      { date: "2026-10-06", sport: "Run", description: "Mid-week tempo", target_rooka: 55 }, // on Tue (blocked)
      { date: "2026-10-07", sport: "Rest", description: "Rest", target_rooka: 0 }, // on Wed (available)
      { date: "2026-10-08", sport: "Run", description: "Intervals", target_rooka: 60 },
      { date: "2026-10-09", sport: "Strength", description: "Core Stability", target_rooka: 32 },
      { date: "2026-10-10", sport: "Run", description: "Recovery Run", target_rooka: 46 },
      { date: "2026-10-11", sport: "Run", description: "Aerobic Long Run with Threshold", target_rooka: 93 }, // on Sun (blocked)
    ];

    const repaired = repairAvailabilityViolations(draftPlanWithViolations, availMap, dates, "en");

    // Tue MUST be Rest
    const tue = repaired.find((d) => d.date === "2026-10-06");
    assert.strictEqual(tue.sport, "Rest", "Tuesday must be repaired to Rest");
    assert.strictEqual(tue.target_rooka, 0, "Tuesday target_rooka must be 0");

    // Sun MUST be Rest
    const sun = repaired.find((d) => d.date === "2026-10-11");
    assert.strictEqual(sun.sport, "Rest", "Sunday must be repaired to Rest");
    assert.strictEqual(sun.target_rooka, 0, "Sunday target_rooka must be 0");

    // Wed (was Rest, available day) received Tuesday's relocated session
    const wed = repaired.find((d) => d.date === "2026-10-07");
    assert.strictEqual(wed.sport, "Run", "Wednesday received relocated workout");
    assert.strictEqual(wed.description, "Mid-week tempo");

    // Sat (180m capacity) received the Sunday heavy long run (swapped)
    const sat = repaired.find((d) => d.date === "2026-10-10");
    assert.strictEqual(sat.sport, "Run");
    assert.strictEqual(sat.target_rooka, 93, "Saturday received the high-load long run");

    console.log("✅ Test 11 Passed: repairAvailabilityViolations guarantees dedicated rest days & relocates sessions");
  }

  console.log("\n🎉 All 11 Workout Planning unit tests passed successfully!");
})();
