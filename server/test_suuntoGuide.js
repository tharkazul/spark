// Suunto guide step titles must fit in 13 characters (Suunto answers HTTP 400 otherwise).
const path = require("path");
const os = require("os");
process.env.DB_PATH = path.join(os.tmpdir(), `rooka_suunto_test_${process.pid}.db`);
const assert = require("assert");
const { buildGuideStep } = require("./routes/suunto");

console.log("⌚ Running Suunto guide tests...\n");

const steps = [
  { type: "warmup", exerciseName: "Dynamic Warmup Jog with A-Skips", condition_type: "time", condition_value: 10, target_type: "heart.rate.zone", zone: 1 },
  { type: "interval", exerciseName: "1000m Threshold", condition_type: "distance", condition_value: 1000, target_type: "pace.exact", target_value: "4:15" },
  { type: "interval", condition_type: "distance_km", condition_value: 12.5, target_type: "no.target" },
  { type: "rest", condition_type: "time_sec", condition_value: 90, target_type: "no.target" },
  { type: "interval", exerciseName: "Heel-Drive Glute Bridges", condition_type: "reps", condition_value: 15, target_type: "no.target" },
  { type: "interval", exerciseName: "Squat", condition_type: "reps", condition_value: 10, target_type: "weight" },
  { type: "interval", exerciseName: "Sweet Spot", condition_type: "time", condition_value: 20, target_type: "power.exact", target_value: "250" },
  { type: "cooldown", exerciseName: "Easy spin", condition_type: "time", condition_value: 5, target_type: "heart.rate.zone", zone: 1 },
];
const titles = [];
const walk = (s) => (s.type === "repeat" ? s.steps.forEach(walk) : titles.push(s.title));
walk(buildGuideStep({ type: "repeat", iterations: 3, steps }, "run", null));
for (const t of titles) assert.ok(Array.from(t).length <= 13, `"${t}" is ${Array.from(t).length} chars`);
assert.ok(titles.includes("1 km @4:15"), titles.join(" | "));
assert.ok(titles.includes("Squat x10"), titles.join(" | "));
assert.ok(titles.some((t) => t.endsWith(" x15")), titles.join(" | "));
console.log("✅ Every step title fits in 13 characters: " + titles.join(" | "));

console.log("\n🎉 All Suunto guide tests passed!");
setTimeout(() => {
  try { require("fs").unlinkSync(process.env.DB_PATH); } catch (_) {}
  process.exit(0);
}, 200);
