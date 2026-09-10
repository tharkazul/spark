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
  const idIdx = args.indexOf("--id");
  const targetId = idIdx !== -1 ? parseInt(args[idIdx + 1], 10) : null;
  const dateIdx = args.indexOf("--date");
  const explicitDate = dateIdx !== -1 ? args[dateIdx + 1] : null;
  const resetBonus = args.includes("--reset-bonus");

  // Ensure user_milestone_history table exists
  await run(`CREATE TABLE IF NOT EXISTS user_milestone_history (
    user_id INTEGER,
    milestone_key TEXT,
    awarded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(user_id, milestone_key)
  )`);

  // 1. Find target athlete
  let users = [];
  if (targetId) {
    users = await all(
      `SELECT id, username, email, rooka_start_date, total_rooka 
       FROM users 
       WHERE id = ?`,
      [targetId]
    );
  } else {
    // Only search ACTIVE non-deleted users matching 'rutger' or ID 11
    users = await all(
      `SELECT id, username, email, rooka_start_date, total_rooka 
       FROM users 
       WHERE (deleted_at IS NULL OR deleted_at = '')
         AND username NOT LIKE '%_deleted_%'
         AND (id = 11 OR username LIKE '%rutger%' OR email LIKE '%rutger%')`
    );
  }

  if (users.length === 0) {
    console.error("❌ No active athlete matching 'rutger' or ID 11 found.");
    console.log("All non-deleted users in database:");
    const allUsers = await all(`SELECT id, username, email, total_rooka FROM users WHERE deleted_at IS NULL LIMIT 20`);
    console.table(allUsers);
    process.exit(1);
  }

  // Count activities for each candidate to pick the active account
  for (const u of users) {
    const actRow = await get(`SELECT COUNT(*) as count FROM activities WHERE user_id = ?`, [u.id]);
    u.activityCount = actRow ? actRow.count : 0;
  }

  // Sort descending by activity count so the real active account with all activities is selected
  users.sort((a, b) => b.activityCount - a.activityCount);

  const user = users[0];
  console.log(`Selected athlete: "${user.username}" (ID: ${user.id}, Email: ${user.email || 'None'})`);
  console.log(`Current DB State:`);
  console.log(`  rooka_start_date: ${user.rooka_start_date || 'NULL'}`);
  console.log(`  total_rooka:      ${user.total_rooka || 0} (Level ${getRookaLevelInfo(user.total_rooka || 0).level})`);

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
      firstTitle?.d && { source: "user_titles", date: firstTitle.d },
      firstQuest?.d && { source: "user_quests", date: firstQuest.d },
      firstChat?.d && { source: "chat_history", date: firstChat.d }
    ].filter(Boolean);

    console.log("Onboarding timestamps found:");
    candidateDates.forEach(c => console.log(`  - ${c.source}: ${c.date}`));

    if (candidateDates.length > 0) {
      candidateDates.sort((a, b) => a.date.localeCompare(b.date));
      detectedDate = candidateDates[0].date;
      console.log(`🔍 Detected earliest join date: ${detectedDate}`);
    }
  }

  if (!detectedDate && user.rooka_start_date && user.rooka_start_date.length >= 10 && user.rooka_start_date !== actStats.oldest_act) {
    detectedDate = user.rooka_start_date.substring(0, 10);
    console.log(`🔍 Using existing start date: ${detectedDate}`);
  }

  if (!detectedDate) {
    console.log("⚠️ Could not auto-detect join date. Please specify using --date YYYY-MM-DD");
    console.log("Example: node server/scripts/fix-athlete-level.js --id 11 --date 2026-08-18");
    process.exit(1);
  }

  console.log(`\n🎯 Applying Rooka Start Date: ${detectedDate}`);

  // Seed user_milestone_history from existing user_titles so milestones are remembered forever
  await run(
    `INSERT OR IGNORE INTO user_milestone_history (user_id, milestone_key, awarded_at)
     SELECT user_id, milestone_key, created_at FROM user_titles WHERE user_id = ? AND milestone_key IS NOT NULL`,
    [user.id]
  );

  // 3. Inspect and Clean Bonus Points
  console.log("\n==================================================");
  console.log("   Bonus Points Audit & Cleanup                   ");
  console.log("==================================================");

  const rawBonusStats = await get(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total FROM bonus_points WHERE user_id = ?`,
    [user.id]
  );
  console.log(`Initial bonus records for athlete: ${rawBonusStats ? rawBonusStats.cnt : 0} rows totaling ${rawBonusStats ? rawBonusStats.total : 0} pts`);

  const breakdown = await all(
    `SELECT reason, COUNT(*) as count, SUM(amount) as total_pts 
     FROM bonus_points 
     WHERE user_id = ? 
     GROUP BY reason 
     ORDER BY count DESC 
     LIMIT 15`,
    [user.id]
  );
  if (breakdown.length > 0) {
    console.log("Top bonus point entries:");
    console.table(breakdown);
  }

  if (resetBonus) {
    const delAll = await run(`DELETE FROM bonus_points WHERE user_id = ?`, [user.id]);
    console.log(`🧹 --reset-bonus specified: Removed ALL ${delAll.changes} bonus records.`);
  } else {
    // 3a. Remove pre-join bonus points
    const oldDel = await run(
      `DELETE FROM bonus_points WHERE user_id = ? AND substr(created_at, 1, 10) < ?`,
      [user.id, detectedDate]
    );
    if (oldDel.changes > 0) {
      console.log(`🧹 Removed ${oldDel.changes} pre-join bonus point records (before ${detectedDate}).`);
    }

    // 3b. Deduplicate repeated entries (loops that awarded the same milestone title dozens/hundreds of times)
    // Keep only the earliest record (MIN(id)) for each distinct reason
    const dupDel = await run(
      `DELETE FROM bonus_points 
       WHERE user_id = ? 
         AND id NOT IN (
           SELECT MIN(id) 
           FROM bonus_points 
           WHERE user_id = ? 
           GROUP BY reason
         )`,
      [user.id, user.id]
    );
    console.log(`🧹 Deduplication: Removed ${dupDel.changes} duplicate bonus records.`);
  }

  const cleanBonusRow = await get(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total 
     FROM bonus_points 
     WHERE user_id = ? AND substr(created_at, 1, 10) >= ?`,
    [user.id, detectedDate]
  );
  const bonusTotal = cleanBonusRow ? cleanBonusRow.total : 0;
  console.log(`✅ Clean Bonus Points: ${bonusTotal} pts across ${cleanBonusRow ? cleanBonusRow.cnt : 0} record(s).\n`);

  // 4. Zero out rooka_score for historical activities before this date
  const zeroResult = await run(
    `UPDATE activities 
     SET rooka_score = 0 
     WHERE user_id = ? AND substr(start_date, 1, 10) < ?`,
    [user.id, detectedDate]
  );
  console.log(`✅ Zeroed out ${zeroResult.changes} historical activities recorded before ${detectedDate}.`);

  // 5. Rescore activities on or after detectedDate
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

  // 6. Calculate new total Rooka points and level
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
