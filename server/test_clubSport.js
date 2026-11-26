// Club sports (tennis, football, hockey) are the athlete's own sessions: a match day is not a
// rest day, and the review never judges a match on pacing (tester feedback, 26 Nov 2026).
const assert = require("assert");
const { detectClubSport, planEntrySport, pickPlanForActivity } = require("./services/clubSport");
const ok = (label) => console.log(`✅ ${label}`);

assert.strictEqual(detectClubSport("Rustdag en voetbal"), "football");
assert.strictEqual(detectClubSport("Tennis les"), "tennis");
assert.strictEqual(detectClubSport("Padel met vrienden"), "padel");
assert.strictEqual(detectClubSport("Hockey Heren 2"), "hockey");
assert.strictEqual(detectClubSport("Tafeltennis"), null);
assert.strictEqual(detectClubSport("Aerobe duurloop"), null);
ok("Club sports are recognised in titles, also in Dutch");

assert.strictEqual(planEntrySport("Rest", "Rustdag en voetbal"), "Run");
assert.strictEqual(planEntrySport("Rest", "Rustdag"), "Rest");
assert.strictEqual(planEntrySport("Strength", "Core voor hockey"), "Strength");
ok("A rest day with a match is stored as a session");

const day = [
  { sport: "Run", description: "Aerobe duurloop", details: "" },
  { sport: "Run", description: "Tennis", details: "Tennis (90 min) - Scheduled recurring session.", source: "recurring" },
];
let r = pickPlanForActivity(day, { rookaSport: "Strength", rawSport: "Tennis", name: "Tennis" });
assert.strictEqual(r.clubSport, "tennis");
assert.strictEqual(r.plan.description, "Tennis", "a Tennis activity finds the tennis entry, not the run");
r = pickPlanForActivity(day, { rookaSport: "Run", rawSport: "Run", name: "Ochtendloop" });
assert.strictEqual(r.clubSport, null);
assert.strictEqual(r.plan.description, "Aerobe duurloop", "a plain run on that day is the rooka run");
r = pickPlanForActivity([day[1]], { rookaSport: "Run", rawSport: "Run", name: "Avondloop" });
assert.strictEqual(r.clubSport, "tennis", "a run on a day with only the tennis session is that session");
r = pickPlanForActivity([{ sport: "Rest", description: "Rustdag en voetbal" }], { rookaSport: "Strength", rawSport: "Soccer", name: "Wedstrijd" });
assert.strictEqual(r.clubSport, "football");
assert.strictEqual(r.plan.description, "Rustdag en voetbal", "older plans: the match on a rest day is found");
r = pickPlanForActivity([], { rookaSport: "Strength", rawSport: "Soccer", name: "Match" });
assert.deepStrictEqual(r, { plan: null, clubSport: "football" });
r = pickPlanForActivity([{ sport: "Rest", description: "Rustdag" }], { rookaSport: "Run", rawSport: "Run", name: "Run" });
assert.deepStrictEqual(r, { plan: null, clubSport: null });
ok("A finished activity finds its own plan entry and knows when it was a match");

console.log("All club sport checks passed.");
