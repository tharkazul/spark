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

  const resolvedDbPath = process.env.DB_PATH 
    ? path.resolve(__dirname, "..", process.env.DB_PATH) 
    : path.join(__dirname, "..", "rooka_native.db");
  console.log(`📂 Active Database File: ${resolvedDbPath}`);

  // Verify database connectivity
  const userCountRow = await get(`SELECT COUNT(*) as count FROM users`).catch((e) => null);
  if (!userCountRow) {
    console.error("❌ Could not read from users table in this database!");
    process.exit(1);
  }
  console.log(`👥 Total users in database: ${userCountRow.count}\n`);

  const args = process.argv.slice(2);
  const dateIdx = args.indexOf("--date");
  const explicitDate = dateIdx !== -1 ? args[dateIdx + 1] : null;

  // 1. Find target athlete
  const users = await all(
    `SELECT id, username, email, rooka_start_date, total_rooka 
     FROM users 
     WHERE username LIKE '%rutger%' OR email LIKE '%rutger%' OR id = 11 OR id = 1`
  );

  if (users.length === 0) {
    console.error("❌ No athlete matching 'rutger' found in the database.");
    console.log("Available users:");
    const allUsers = await all(`SELECT id, username, email FROM users LIMIT 10`);
    console.table(allUsers);
    process.exit(1);
  }

  const user = users[0];
  console.log(`Selected athlete: "${user.username}" (ID: ${user.id}, Email: ${user.email || 'None'})`);
  console.log(`Current DB State:`);
  console.log(`  rooka_start_date: ${user.rooka_start_date || 'NULL'}`);
  console.log(`  total_rooka:      ${user.total_rooka || 0} (${getRookaLevelInfo(user.total_rooka || 0).level})`);

  // Activity stats
  const actStats = await get(
    `SELECT COUNT(*) as total_acts, 
            MIN(substr(start_date, 1, 10)) as oldest_act, 
            MAX(substr(start_date, 1, 10)) as newest_act 
     FROM activities WHERE user_id = ?`,
    [user.id]
  );
  console.log(`  Total Activities in DB: ${actStats.total_acts} (ranging from ${actStats.oldest_act} to ${actStats.newest_act})\n`);

  // 2. Determine actual Rooka join date
  let detectedDate = explicitDate;

  if (!detectedDate) {
    // Check earliest onboarding quest or title
    const firstTitle = await get(
      `SELECT MIN(substr(created_at, 1, 10)) as d FROM user_titles WHERE user_id = ?`,
      [user.id]
    ).catch(() => null);

    const firstQuest = await get(
      `SELECT MIN(substr(created_at, 1, 10)) as d FROM user_quests WHERE user_id = ?`,
      [user.id]
    ).catch(() => null);

    const firstChat = await get(
      `SELECT MIN(substr(timestamp, 1, 10)) as d FROM chat_history WHERE user_id = ?`,
      [user.id]
    ).catch(() => null);

    const candidateDates = [
      firstTitle?.d,
      firstQuest?.d,
      firstChat?.d
    ].filter(Boolean).sort();

    if (candidateDates.length > 0) {
      detectedDate = candidateDates[0];
      console.log(`🔍 Detected athlete join date from onboarding records: ${detectedDate}`);
    }
  }

  if (!detectedDate && user.rooka_start_date && user.rooka_start_date.length >= 10 && user.rooka_start_date !== actStats.oldest_act) {
    detectedDate = user.rooka_start_date.substring(0, 10);
    console.log(`🔍 Using existing start date: ${detectedDate}`);
  }

  if (!detectedDate) {
    console.log("⚠️ Could not auto-detect join date. Please specify it using: node server/scripts/fix-athlete-level.js --date YYYY-MM-DD");
    console.log("Example: node server/scripts/fix-athlete-level.js --date 2026-08-01");
    process.exit(1);
  }

  console.log(`\n🎯 Applying Rooka Start Date: ${detectedDate}`);

  // 3. Zero out rooka_score for historical activities before this date
  const zeroResult = await run(
    `UPDATE activities 
     SET rooka_score = 0 
     WHERE user_id = ? AND substr(start_date, 1, 10) < ?`,
    [user.id, detectedDate]
  );
  console.log(`✅ Zeroed out ${zeroResult.changes} historical activities recorded before ${detectedDate}.`);

  // 4. Rescore activities on or after detectedDate
  const eligibleActivities = await all(
    `SELECT id, moving_time_min, average_heartrate, average_watts, tss, start_date, rooka_score
     FROM activities
     WHERE user_id = ? AND substr(start_date, 1, 10) >= ?
     ORDER BY start_date ASC`,
    [user.id, detectedDate]
  );
  console.log(`🏃 Rescoring ${eligibleActivities.length} activities logged on or after ${detectedDate}...`);

  let hrZones = null;
  let powerZones = null;
  try {
    const resolvedZones = await athleteZones.resolveZonesForUser(user.id, "default");
    hrZones = resolvedZones.hrZones;
    powerZones = resolvedZones.powerZones;
  } catch (e) {
    // Fallback zones
  }

  let actTotal = 0;
  for (const act of eligibleActivities) {
    let score = 0;
    if (hrZones) {
      score = zoneModel.scoreActivity({
        movingMinutes: act.moving_time_min,
        avgHr: act.average_heartrate,
        avgWatts: act.average_watts,
        hrZones,
        powerZones,
      });
    }
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
  ).catch(() => ({ bonus: 0 }));
  const bonusTotal = bonusRow ? bonusRow.bonus : 0;

  const newTotalRooka = Math.round((actTotal + bonusTotal) * 10) / 10;
  const levelInfo = getRookaLevelInfo(newTotalRooka);

  // 6. Update user record
  await run(
    `UPDATE users SET rooka_start_date = ?, total_rooka = ? WHERE id = ?`,
    [detectedDate, newTotalRooka, user.id]
  );

  // 7. Clear public profile cache so social view and coach update immediately
  await run(`DELETE FROM public_profile_cache WHERE user_id = ?`, [user.id]).catch(() => {});

  console.log("\n==================================================");
  console.log("🎉 SUCCESS! Athlete profile repaired:");
  console.log(`   Athlete:             ${user.username} (ID: ${user.id})`);
  console.log(`   Rooka Start Date:    ${detectedDate}`);
  console.log(`   Activities Total:    ${actTotal} pts (${eligibleActivities.length} activities scored)`);
  console.log(`   Bonus Points:        ${bonusTotal} pts`);
  console.log(`   New Total Rooka:     ${newTotalRooka} pts`);
  console.log(`   Calculated Level:    Level ${levelInfo.level}`);
  console.log("==================================================\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
