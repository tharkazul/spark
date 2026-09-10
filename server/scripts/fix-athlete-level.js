const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
const db = require("../services/db");
const { getRookaLevelInfo } = require("../services/utils");
const athleteZones = require("../services/athleteZones");
const zoneModel = require("../services/zones");

function all(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])))
  );
}

function get(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)))
  );
}

function run(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    })
  );
}

async function main() {
  console.log("==================================================");
  console.log("   Rooka Athlete Level & Start Date Repair Tool   ");
  console.log("==================================================\n");

  const args = process.argv.slice(2);
  const dateIdx = args.indexOf("--date");
  const explicitDate = dateIdx !== -1 ? args[dateIdx + 1] : null;

  // 1. Find the target athlete (Rutger or first user)
  const users = await all(
    `SELECT id, username, email, rooka_start_date, total_rooka, created_at 
     FROM users 
     WHERE username LIKE '%rutger%' OR email LIKE '%rutger%' OR id = 11 OR id = 1`
  );

  if (users.length === 0) {
    console.error("No athlete matching 'rutger' found.");
    process.exit(1);
  }

  const user = users[0];
  console.log(`Found athlete: "${user.username}" (ID: ${user.id}, Email: ${user.email})`);
  console.log(`Current DB State:`);
  console.log(`  rooka_start_date: ${user.rooka_start_date || 'NULL'}`);
  console.log(`  total_rooka:      ${user.total_rooka || 0} (${getRookaLevelInfo(user.total_rooka || 0).level})`);

  // 2. Determine actual Rooka join date
  let detectedDate = explicitDate;

  if (!detectedDate) {
    // Try chat_history (when did the athlete first chat with the coach?)
    const firstChat = await get(
      `SELECT MIN(substr(timestamp, 1, 10)) as d FROM chat_history WHERE user_id = ?`,
      [user.id]
    );
    if (firstChat && firstChat.d) {
      detectedDate = firstChat.d;
      console.log(`  Earliest coach chat detected on: ${detectedDate}`);
    }
  }

  if (!detectedDate && user.created_at) {
    detectedDate = user.created_at.substring(0, 10);
    console.log(`  Account creation date: ${detectedDate}`);
  }

  if (!detectedDate) {
    // Default fallback to 30 days ago or prompt user
    console.log("⚠️ Could not auto-detect start date. Please run with --date YYYY-MM-DD (e.g. node scripts/fix-athlete-level.js --date 2026-08-01)");
    process.exit(1);
  }

  console.log(`\n🎯 Applying Rooka Start Date: ${detectedDate}`);

  // 3. Zero out rooka_score for all activities strictly before this date
  const zeroResult = await run(
    `UPDATE activities 
     SET rooka_score = 0 
     WHERE user_id = ? AND substr(start_date, 1, 10) < ?`,
    [user.id, detectedDate]
  );
  console.log(`✅ Zeroed out ${zeroResult.changes} historical pre-Rooka activities.`);

  // 4. Rescore eligible activities on or after detectedDate
  const eligibleActivities = await all(
    `SELECT id, moving_time_min, average_heartrate, average_watts, tss, start_date, rooka_score
     FROM activities
     WHERE user_id = ? AND substr(start_date, 1, 10) >= ?
     ORDER BY start_date ASC`,
    [user.id, detectedDate]
  );
  console.log(`🏃 Found ${eligibleActivities.length} activities logged since joining Rooka on ${detectedDate}.`);

  const { hrZones, powerZones } = await athleteZones.resolveZonesForUser(user.id, "default");

  let actTotal = 0;
  for (const act of eligibleActivities) {
    let score = zoneModel.scoreActivity({
      movingMinutes: act.moving_time_min,
      avgHr: act.average_heartrate,
      avgWatts: act.average_watts,
      hrZones,
      powerZones,
    });
    if (!score || score <= 0) {
      score = act.moving_time_min || act.tss || 0;
    }
    score = Math.round(score * 10) / 10;
    actTotal += score;
    await run(`UPDATE activities SET rooka_score = ? WHERE id = ?`, [score, act.id]);
  }
  actTotal = Math.round(actTotal * 10) / 10;

  // 5. Calculate bonus points earned since start date
  const bonusRow = await get(
    `SELECT COALESCE(SUM(amount), 0) as bonus FROM bonus_points WHERE user_id = ? AND substr(created_at, 1, 10) >= ?`,
    [user.id, detectedDate]
  );
  const bonusTotal = bonusRow ? bonusRow.bonus : 0;

  const newTotalRooka = Math.round((actTotal + bonusTotal) * 10) / 10;
  const levelInfo = getRookaLevelInfo(newTotalRooka);

  // 6. Update user record
  await run(
    `UPDATE users SET rooka_start_date = ?, total_rooka = ? WHERE id = ?`,
    [detectedDate, newTotalRooka, user.id]
  );

  // 7. Invalidate profile cache so changes appear immediately
  await run(`DELETE FROM public_profile_cache WHERE user_id = ?`, [user.id]);

  console.log("\n==================================================");
  console.log("🎉 SUCCESS! Athlete profile repaired:");
  console.log(`   Rooka Start Date:    ${detectedDate}`);
  console.log(`   Activities Total:    ${actTotal} pts (${eligibleActivities.length} activities)`);
  console.log(`   Bonus Points Total:  ${bonusTotal} pts`);
  console.log(`   New Total Rooka:     ${newTotalRooka} pts`);
  console.log(`   New Level:           Level ${levelInfo.level}`);
  console.log("==================================================\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
