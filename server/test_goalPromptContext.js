const assert = require("assert");
const {
  detectAthleteGoalDiscipline,
  getGoalDependentPromptContext,
  loadPromptTemplates,
} = require("./services/goalPromptContext");

console.log("🏃 Running Goal Prompt Context unit tests...\n");

// Test 1: Load templates
{
  const templates = loadPromptTemplates();
  assert.ok(templates.hyrox && templates.hyrox.length > 50, "Hyrox template must be loaded");
  assert.ok(templates.triathlon && templates.triathlon.length > 50, "Triathlon template must be loaded");
  assert.ok(templates.running && templates.running.length > 50, "Running template must be loaded");
  console.log("✅ Test 1 Passed: Prompt templates loaded from disk successfully");
}

// Test 2: Discipline Detection - Hyrox
{
  // Primary milestone Hyrox
  const user1 = { athlete_context: "Athlete" };
  const milestones1 = [{ name: "Hyrox Amsterdam", is_main: 1, date: "2026-11-20" }];
  assert.strictEqual(detectAthleteGoalDiscipline(user1, milestones1), "hyrox");

  // Deka Fit in context
  const user2 = { athlete_context: "Training for DEKA FIT competition" };
  assert.strictEqual(detectAthleteGoalDiscipline(user2, []), "hyrox");

  // Functional fitness in athlete context
  const user3 = { athlete_context: "Functional fitness competitor" };
  assert.strictEqual(detectAthleteGoalDiscipline(user3, []), "hyrox");
  console.log("✅ Test 2 Passed: Hyrox discipline correctly detected across milestones and user context");
}

// Test 3: Discipline Detection - Triathlon & Ironman
{
  // Primary milestone Ironman 70.3
  const user1 = { athlete_context: "Triathlete" };
  const milestones1 = [{ name: "Ironman 70.3 Nice", is_main: 1, date: "2026-09-15" }];
  assert.strictEqual(detectAthleteGoalDiscipline(user1, milestones1), "triathlon");

  // 140.6 full distance
  const user2 = { target_event: "Challenge Roth 140.6" };
  assert.strictEqual(detectAthleteGoalDiscipline(user2, []), "triathlon");

  // Sprint triathlon
  const milestones3 = [{ name: "Sprint Triathlon", is_main: 0, date: "2026-10-01", goal_type: "race" }];
  assert.strictEqual(detectAthleteGoalDiscipline({}, milestones3), "triathlon");
  console.log("✅ Test 3 Passed: Triathlon & Ironman correctly detected");
}

// Test 4: Discipline Detection - Running & General
{
  // Marathon
  const milestones1 = [{ name: "Rotterdam Marathon", is_main: 1, date: "2027-04-10" }];
  assert.strictEqual(detectAthleteGoalDiscipline({}, milestones1), "running");

  // General fitness
  const userGeneral = { athlete_context: "Looking to stay active and healthy" };
  assert.strictEqual(detectAthleteGoalDiscipline(userGeneral, []), "general");
  console.log("✅ Test 4 Passed: Running and General correctly detected");
}

// Test 5: Goal Context Content & Boundary Separation
{
  const hyroxContext = getGoalDependentPromptContext("hyrox");
  assert.ok(hyroxContext.includes("Sled Push") || hyroxContext.includes("sled"), "Hyrox must include sled work");
  assert.ok(hyroxContext.includes("SkiErg"), "Hyrox must include SkiErg");
  assert.ok(!hyroxContext.includes("pull buoy"), "Hyrox must NOT include pull buoy");
  assert.ok(!hyroxContext.includes("aero bars"), "Hyrox must NOT include aero bars");

  const triContext = getGoalDependentPromptContext("triathlon");
  assert.ok(triContext.includes("pull buoy"), "Triathlon must include pull buoy");
  assert.ok(triContext.includes("paddles"), "Triathlon must include paddles");
  assert.ok(triContext.includes("over-under") || triContext.includes("Over-Under"), "Triathlon must include over-under bike drills");
  assert.ok(!hyroxContext.includes("pull buoy"), "Hyrox must NOT include pull buoy");
  assert.ok(!triContext.includes("Sled Push") && !triContext.includes("Wall Balls"), "Triathlon must NOT include Hyrox sled/wall ball drills");

  const runContext = getGoalDependentPromptContext("running");
  assert.ok(runContext.includes("high heels") || runContext.includes("heel recovery"), "Running must include high heels cue");
  assert.ok(runContext.includes("A-Skips") || runContext.includes("A-skips"), "Running must include A-skips");

  console.log("✅ Test 5 Passed: Goal contexts contain exact discipline drills with clean separation");
}

// Test 6: Async getUserGoalPromptContext
(async () => {
  const { getUserGoalPromptContext } = require("./services/goalPromptContext");
  
  // Test with fallbackUser containing Hyrox
  const res1 = await getUserGoalPromptContext(null, { athlete_context: "Hyrox athlete" });
  assert.strictEqual(res1.discipline, "hyrox");
  assert.ok(res1.promptContext.includes("HYROX"));

  // Test with fallbackUser containing Triathlon
  const res2 = await getUserGoalPromptContext(null, { target_event: "Ironman 70.3" });
  assert.strictEqual(res2.discipline, "triathlon");
  assert.ok(res2.promptContext.includes("TRIATHLON"));

  console.log("✅ Test 6 Passed: Async getUserGoalPromptContext successfully returns discipline & prompt context");
  console.log("\n🎉 All 6 Goal Prompt Context tests passed successfully!");
})();
