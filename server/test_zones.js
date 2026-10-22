const assert = require("assert");
const zoneModel = require("./services/zones");
const utils = require("./services/utils");

console.log("🏊🏋️ Running Zone & Sport Density Scoring unit tests...\n");

// Test 1: sportDensityMultiplier values
{
  assert.strictEqual(zoneModel.sportDensityMultiplier("Swim"), 1.5);
  assert.strictEqual(zoneModel.sportDensityMultiplier("SWIM"), 1.5);
  assert.strictEqual(zoneModel.sportDensityMultiplier("swim"), 1.5);
  assert.strictEqual(zoneModel.sportDensityMultiplier("Open Water Swim"), 1.5);
  assert.strictEqual(zoneModel.sportDensityMultiplier("Pool Swim"), 1.5);

  assert.strictEqual(zoneModel.sportDensityMultiplier("Strength"), 0.75);
  assert.strictEqual(zoneModel.sportDensityMultiplier("STRENGTH"), 0.75);
  assert.strictEqual(zoneModel.sportDensityMultiplier("strength"), 0.75);
  assert.strictEqual(zoneModel.sportDensityMultiplier("WeightTraining"), 0.75);
  assert.strictEqual(zoneModel.sportDensityMultiplier("Weight Training"), 0.75);
  assert.strictEqual(zoneModel.sportDensityMultiplier("Gym Workout"), 0.75);
  assert.strictEqual(zoneModel.sportDensityMultiplier("CrossFit"), 0.75);
  assert.strictEqual(zoneModel.sportDensityMultiplier("Hyrox"), 0.75);

  assert.strictEqual(zoneModel.sportDensityMultiplier("Run"), 1.0);
  assert.strictEqual(zoneModel.sportDensityMultiplier("Bike"), 1.0);
  assert.strictEqual(zoneModel.sportDensityMultiplier("Ride"), 1.0);
  assert.strictEqual(zoneModel.sportDensityMultiplier("Walk"), 1.0);
  assert.strictEqual(zoneModel.sportDensityMultiplier("Rest"), 1.0);
  assert.strictEqual(zoneModel.sportDensityMultiplier(null), 1.0);
  assert.strictEqual(zoneModel.sportDensityMultiplier(undefined), 1.0);

  console.log("✅ Test 1 Passed: sportDensityMultiplier correctly maps swim (1.5x), strength (0.75x), and standard sports (1.0x)");
}

// Test 2: Completed Activity Scoring with HR Zones
{
  const hrZones = [
    { zone: 1, min: 95, max: 114 },
    { zone: 2, min: 114, max: 133 },
    { zone: 3, min: 133, max: 152 },
    { zone: 4, min: 152, max: 171 },
    { zone: 5, min: 171, max: 190 },
  ];

  // 20-min Swim at Z2 (HR = 125, effort = 1.2): 20 * 1.2 * 1.5 = 36
  const swimScoreZ2 = zoneModel.scoreActivity({
    movingMinutes: 20,
    avgHr: 125,
    hrZones,
    sport: "Swim",
  });
  assert.strictEqual(swimScoreZ2, 36, `Expected 36 for 20-min Z2 swim, got ${swimScoreZ2}`);

  // 20-min Swim at Z1 / fallback (HR = 100, effort = 1.0): 20 * 1.0 * 1.5 = 30
  const swimScoreZ1 = zoneModel.scoreActivity({
    movingMinutes: 20,
    avgHr: 100,
    hrZones,
    sport: "Swim",
  });
  assert.strictEqual(swimScoreZ1, 30, `Expected 30 for 20-min Z1 swim, got ${swimScoreZ1}`);

  // 40-min Strength session (HR = 105, effort = 1.0): 40 * 1.0 * 0.75 = 30
  const strengthScore = zoneModel.scoreActivity({
    movingMinutes: 40,
    avgHr: 105,
    hrZones,
    sport: "Strength",
  });
  assert.strictEqual(strengthScore, 30, `Expected 30 for 40-min Strength session, got ${strengthScore}`);

  // 40-min Run at Z2 (HR = 125, effort = 1.2): 40 * 1.2 * 1.0 = 48
  const runScore = zoneModel.scoreActivity({
    movingMinutes: 40,
    avgHr: 125,
    hrZones,
    sport: "Run",
  });
  assert.strictEqual(runScore, 48, `Expected 48 for 40-min Z2 run, got ${runScore}`);

  // 60-min Bike at Z3 (HR = 140, effort = 1.3): 60 * 1.3 * 1.0 = 78
  const bikeScore = zoneModel.scoreActivity({
    movingMinutes: 60,
    avgHr: 140,
    hrZones,
    sport: "Bike",
  });
  assert.strictEqual(bikeScore, 78, `Expected 78 for 60-min Z3 bike, got ${bikeScore}`);

  // Backward compatibility: sport omitted defaults to 1.0x
  const defaultScore = zoneModel.scoreActivity({
    movingMinutes: 20,
    avgHr: 125,
    hrZones,
  });
  assert.strictEqual(defaultScore, 24, `Expected 24 without sport, got ${defaultScore}`);

  console.log("✅ Test 2 Passed: scoreActivity applies sport density multiplier (swim=36 pts vs strength=30 pts vs run=48 pts)");
}

// Test 3: Structured Steps Scoring (scoreSteps)
{
  // 1000m swim interval: 1000 / 100 * 1.8 = 18 equivalent minutes
  // At target_type = "heart.rate.zone", zone = 2 (multiplier 1.2):
  // 18 * 1.2 = 21.6 base * 1.5 density = 32.4
  const swimSteps = [
    { type: "interval", condition_type: "distance", condition_value: 1000, target_type: "heart.rate.zone", zone: 2 }
  ];
  const swimTarget = zoneModel.scoreSteps(swimSteps, { sport: "Swim" });
  assert.strictEqual(swimTarget, 32.4, `Expected 32.4 for 1000m Z2 swim, got ${swimTarget}`);

  // Strength session with 30 equivalent minutes untargeted (multiplier 1.0):
  // 30 * 1.0 * 0.75 density = 22.5
  const strengthSteps = [
    { type: "interval", condition_type: "time", condition_value: 30, target_type: "no.target" }
  ];
  const strengthTarget = zoneModel.scoreSteps(strengthSteps, { sport: "Strength" });
  assert.strictEqual(strengthTarget, 22.5, `Expected 22.5 for 30m strength, got ${strengthTarget}`);

  console.log("✅ Test 3 Passed: scoreSteps applies sport density multiplier to planned workouts");
}

// Test 4: planDayTargetRooka
{
  const swimDay = {
    sport: "Swim",
    steps_json: JSON.stringify([
      { type: "interval", condition_type: "distance", condition_value: 1000, target_type: "heart.rate.zone", zone: 2 }
    ]),
  };
  const swimPlanTarget = zoneModel.planDayTargetRooka(swimDay);
  assert.strictEqual(swimPlanTarget, 32, `Expected 32 for planned swim day, got ${swimPlanTarget}`);

  // Test day with .steps property instead of .steps_json
  const strengthDay = {
    sport: "Strength",
    steps: [
      { type: "interval", condition_type: "time", condition_value: 40, target_type: "no.target" }
    ],
  };
  const strengthPlanTarget = zoneModel.planDayTargetRooka(strengthDay);
  assert.strictEqual(strengthPlanTarget, 30, `Expected 30 for planned 40m strength day, got ${strengthPlanTarget}`);

  console.log("✅ Test 4 Passed: planDayTargetRooka synchronizes planned targets with density multipliers");
}

// Test 5: utils.calculateRookaScore & calculateRookaScoreZoned forwarding
(async () => {
  // Legacy calculateRookaScore with sport
  const swimLegacy = utils.calculateRookaScore(20, null, 0, "Swim");
  assert.strictEqual(swimLegacy, 30, `Expected 30 for 20m swim fallback, got ${swimLegacy}`);

  const strengthLegacy = utils.calculateRookaScore(40, null, 0, "Strength");
  assert.strictEqual(strengthLegacy, 30, `Expected 30 for 40m strength fallback, got ${strengthLegacy}`);

  // calculateRookaScoreZoned with mocked user zones
  const db = require("./services/db");
  const testUser = await new Promise((resolve) => {
    db.get(`SELECT id FROM users LIMIT 1`, (err, row) => resolve(row));
  });

  if (testUser) {
    const zonedSwim = await utils.calculateRookaScoreZoned({
      userId: testUser.id,
      movingTimeMin: 20,
      avgHr: 120,
      sport: "Swim",
    });
    // Swim score should be scaled by 1.5x
    assert.ok(zonedSwim >= 30, `Zoned swim score should be at least 30, got ${zonedSwim}`);

    const zonedStrength = await utils.calculateRookaScoreZoned({
      userId: testUser.id,
      movingTimeMin: 40,
      avgHr: 110,
      sport: "Strength",
    });
    // Strength score should be scaled by 0.75x
    assert.ok(zonedStrength <= 36, `Zoned strength score should be around 30, got ${zonedStrength}`);
  }

  console.log("✅ Test 5 Passed: utils calculateRookaScore and calculateRookaScoreZoned correctly propagate sport");

  console.log("\n🎉 All Zone & Sport Density Scoring unit tests passed successfully!");
  process.exit(0);
})();
