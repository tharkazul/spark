const assert = require("assert");
const {
  getUpcomingWeekMonToSun,
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
  assert.strictEqual(typeof service.runWeeklyWorkoutPlanningJob, "function");
  console.log("✅ Test 6 Passed: workoutPlanning service exports all required methods");
}

console.log("\n🎉 All 6 Workout Planning unit tests passed successfully!");
