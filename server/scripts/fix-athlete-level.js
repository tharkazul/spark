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

async function repairAthlete(user, options = {}) {
  const { explicitDate, resetBonus, isVerbose } = options;

  if (isVerbose) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Processing Athlete: "${user.username}" (ID: ${user.id}, Email: ${user.email || 'None'})`);
    console.log(`Current DB State: rooka_start_date = ${user.rooka_start_date || 'NULL'}, total_rooka = ${user.total_rooka || 0} (Level ${getRookaLevelInfo(user.total_rooka || 0).level})`);
  }

  // Activity stats
  const actStats = await get(
    `SELECT COUNT(*) as total_acts, 
            MIN(substr(start_date, 1, 10)) as oldest_act, 
            MAX(substr(start_date, 1, 10)) as newest_act 
     FROM activities WHERE user_id = ?`,
    [user.id]
  );

  // 1. Determine actual Rooka join date
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

    if (candidateDates.length > 0) {
      candidateDates.sort((a, b) => a.date.localeCompare(b.date));
      detectedDate = candidateDates[0].date;
    }
  }

  if (!detectedDate && user.rooka_start_date && user.rooka_start_date.length >= 10 && actStats && user.rooka_start_date !== actStats.oldest_act) {
    detectedDate = user.rooka_start_date.substring(0, 10);
  }

  if (!detectedDate && actStats && actStats.oldest_act) {
    detectedDate = actStats.oldest_act;
  }

  if (!detectedDate) {
    detectedDate = new Date().toISOString().substring(0, 10);
  }

  // Seed user_milestone_history so active titles aren't re-evaluated
  await run(
    `INSERT OR IGNORE INTO user_milestone_history (user_id, milestone_key, awarded_at)
     SELECT user_id, milestone_key, created_at FROM user_titles WHERE user_id = ? AND milestone_key IS NOT NULL`,
    [user.id]
  );

  // 2. Inspect & Clean Bonus Points
  const currentTitles = await all(
    `SELECT id, title, is_active, milestone_key FROM user_titles WHERE user_id = ?`,
    [user.id]
  );
  const completedQuests = await all(
    `SELECT id, description, reward_points FROM user_quests WHERE user_id = ? AND status = 'completed'`,
    [user.id]
  );

  if (resetBonus) {
    await run(`DELETE FROM bonus_points WHERE user_id = ?`, [user.id]);
  } else {
    // Remove pre-join bonus points
    await run(
      `DELETE FROM bonus_points WHERE user_id = ? AND substr(created_at, 1, 10) < ?`,
      [user.id, detectedDate]
    );

    // Build list of legitimate bonus reasons: only titles currently held or quests completed
    const legitimateTitleReasons = [];
    currentTitles.forEach((t) => {
      legitimateTitleReasons.push(`Earned Milestone Title: ${t.title}`);
      legitimateTitleReasons.push(`Earned Title: ${t.title}`);
    });
    const legitimateQuestReasons = completedQuests.map((q) => `Quest Completed: ${q.description}`);
    const allLegitimateReasons = [...legitimateTitleReasons, ...legitimateQuestReasons];

    if (allLegitimateReasons.length > 0) {
      const placeholders = allLegitimateReasons.map(() => '?').join(',');
      await run(
        `DELETE FROM bonus_points 
         WHERE user_id = ? 
           AND reason NOT IN (${placeholders})`,
        [user.id, ...allLegitimateReasons]
      );
    } else {
      await run(
        `DELETE FROM bonus_points 
         WHERE user_id = ? 
           AND (reason LIKE 'Earned Milestone Title:%' OR reason LIKE 'Earned Title:%' OR reason LIKE 'Quest Completed:%')`,
        [user.id]
      );
    }

    // Deduplicate repeated legitimate records (keep only earliest MIN(id) for each reason)
    await run(
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
  }

  const cleanBonusRow = await get(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total 
     FROM bonus_points 
     WHERE user_id = ? AND substr(created_at, 1, 10) >= ?`,
    [user.id, detectedDate]
  );
  const bonusTotal = cleanBonusRow ? cleanBonusRow.total : 0;

  // 3. Zero out pre-join activities
  await run(
    `UPDATE activities 
     SET rooka_score = 0 
     WHERE user_id = ? AND substr(start_date, 1, 10) < ?`,
    [user.id, detectedDate]
  );

  // 4. Rescore post-join activities
  const eligibleActivities = await all(
    `SELECT id, moving_time_min, average_heartrate, average_watts, tss, start_date, rooka_score
     FROM activities
     WHERE user_id = ? AND substr(start_date, 1, 10) >= ?
     ORDER BY start_date ASC`,
    [user.id, detectedDate]
  );

  let hrZones = null;
  let powerZones = null;
  try {
    const resolvedZones = await athleteZones.resolveZonesForUser(user.id, "default");
    hrZones = resolvedZones.hrZones;
    powerZones = resolvedZones.powerZones;
  } catch (e) {
    // Fallback
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

  // 5. Calculate new total Rooka and level
  const newTotalRooka = Math.round((actTotal + bonusTotal) * 10) / 10;
  const levelInfo = getRookaLevelInfo(newTotalRooka);

  // 6. Update user record
  await run(
    `UPDATE users SET rooka_start_date = ?, total_rooka = ? WHERE id = ?`,
    [detectedDate, newTotalRooka, user.id]
  );

  // 7. Clear public profile cache
  await run(`DELETE FROM public_profile_cache WHERE user_id = ?`, [user.id]).catch(() => {});

  if (isVerbose) {
    console.log(`   Join Date:          ${detectedDate}`);
    console.log(`   Activities Scored:  ${eligibleActivities.length} activities (${actTotal} pts)`);
    console.log(`   Clean Bonus Points: ${bonusTotal} pts across ${cleanBonusRow ? cleanBonusRow.cnt : 0} record(s)`);
    console.log(`   New Total Rooka:    ${newTotalRooka} pts (${levelInfo.level ? 'Level ' + levelInfo.level : 'Level 1'})`);
  }

  return {
    id: user.id,
    username: user.username,
    startDate: detectedDate,
    actsScored: eligibleActivities.length,
    actPoints: actTotal,
    bonusPoints: bonusTotal,
    totalRooka: newTotalRooka,
    level: `Level ${levelInfo.level}`
  };
}

async function main() {
  console.log("==================================================");
  console.log("   Rooka Athlete Level & Start Date Repair Tool   ");
  console.log("==================================================\n");

  const resolvedDbPath = process.env.DB_PATH 
    ? path.resolve(__dirname, "..", process.env.DB_PATH) 
    : path.join(__dirname, "..", "rooka_native.db");
  console.log(`📂 Active Database File: ${resolvedDbPath}`);

  const userCountRow = await get(`SELECT COUNT(*) as count FROM users`).catch((e) => null);
  if (!userCountRow) {
    console.error("❌ Could not read from users table in this database!");
    process.exit(1);
  }
  console.log(`👥 Total users in database: ${userCountRow.count}\n`);

  const args = process.argv.slice(2);
  const isAll = args.includes("--all");
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

  let targetUsers = [];
  if (isAll) {
    targetUsers = await all(
      `SELECT id, username, email, rooka_start_date, total_rooka 
       FROM users 
       WHERE (deleted_at IS NULL OR deleted_at = '')
         AND username NOT LIKE '%_deleted_%'
       ORDER BY id ASC`
    );
    console.log(`🚀 Running repair for ALL ${targetUsers.length} active athletes in database...\n`);
  } else if (targetId) {
    targetUsers = await all(
      `SELECT id, username, email, rooka_start_date, total_rooka 
       FROM users 
       WHERE id = ?`,
      [targetId]
    );
  } else {
    // Default to Rutger (ID 11 or matching username/email)
    targetUsers = await all(
      `SELECT id, username, email, rooka_start_date, total_rooka 
       FROM users 
       WHERE (deleted_at IS NULL OR deleted_at = '')
         AND username NOT LIKE '%_deleted_%'
         AND (id = 11 OR username LIKE '%rutger%' OR email LIKE '%rutger%')`
    );
    for (const u of targetUsers) {
      const actRow = await get(`SELECT COUNT(*) as count FROM activities WHERE user_id = ?`, [u.id]);
      u.activityCount = actRow ? actRow.count : 0;
    }
    targetUsers.sort((a, b) => b.activityCount - a.activityCount);
    targetUsers = targetUsers.slice(0, 1);
  }

  if (targetUsers.length === 0) {
    console.error("❌ No active athlete(s) found matching criteria.");
    process.exit(1);
  }

  const summary = [];
  for (const user of targetUsers) {
    const res = await repairAthlete(user, {
      explicitDate: targetUsers.length === 1 ? explicitDate : null,
      resetBonus,
      isVerbose: true
    });
    summary.push(res);
  }

  console.log("\n==================================================");
  console.log("            ATHLETE REPAIR SUMMARY                ");
  console.log("==================================================");
  console.table(summary);
  console.log("🎉 SUCCESS! Athlete profile(s) repaired.\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
