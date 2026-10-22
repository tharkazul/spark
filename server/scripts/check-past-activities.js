#!/usr/bin/env node
/**
 * Audit and verify all past activities in Rooka.
 *
 * Compares stored rooka_score against recalculated scores using athlete zone tables,
 * power applicability rules, and the sport density multipliers (Swim 1.5x, Strength 0.75x, Run/Bike 1.0x).
 *
 * Usage:
 *   node scripts/check-past-activities.js                      # Audit all users (dry run)
 *   node scripts/check-past-activities.js --user=tharaka       # Check specific user
 *   node scripts/check-past-activities.js --sport=swim         # Check specific sport
 *   node scripts/check-past-activities.js --since=2026-10-01   # Filter by start date
 *   node scripts/check-past-activities.js --apply              # Write changes & refresh totals
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const db = require("../services/db");
const {
  calculateRookaScoreZoned,
  mapStravaSportToRooka,
  updateUserRookaAndCheckLevel,
  getRookaLevelInfo,
} = require("../services/utils");

// Parse command line arguments
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const ALL_DIFFS = args.includes("--all");

const getArgVal = (prefix) => {
  const match = args.find((a) => a.startsWith(prefix));
  return match ? match.split("=")[1] : null;
};

const USER_FILTER = getArgVal("--user");
const SPORT_FILTER = getArgVal("--sport");
const SINCE_FILTER = getArgVal("--since");
const LIMIT_ROWS = parseInt(getArgVal("--limit") || "20", 10);

function queryAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

function queryRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

(async () => {
  console.log("================================================================================");
  console.log("🔍 ROOKA PAST ACTIVITIES AUDIT & INTEGRITY CHECK");
  console.log("================================================================================");
  console.log(`Mode:    ${APPLY ? "🚀 APPLY (Changes WILL be written to the database)" : "👀 AUDIT ONLY (Dry run - no database changes)"}`);
  if (USER_FILTER) console.log(`Filter:  User = "${USER_FILTER}"`);
  if (SPORT_FILTER) console.log(`Filter:  Sport = "${SPORT_FILTER}"`);
  if (SINCE_FILTER) console.log(`Filter:  Since = "${SINCE_FILTER}"`);
  console.log("--------------------------------------------------------------------------------\n");

  // Build SQL filters
  const conditions = [];
  const params = [];

  if (USER_FILTER) {
    if (/^\d+$/.test(USER_FILTER)) {
      conditions.push("(u.id = ?)");
      params.push(parseInt(USER_FILTER, 10));
    } else {
      conditions.push("(LOWER(u.username) LIKE ? OR LOWER(u.email) LIKE ?)");
      params.push(`%${USER_FILTER.toLowerCase()}%`, `%${USER_FILTER.toLowerCase()}%`);
    }
  }

  if (SPORT_FILTER) {
    conditions.push("(LOWER(a.sport_type) LIKE ? OR LOWER(a.name) LIKE ?)");
    params.push(`%${SPORT_FILTER.toLowerCase()}%`, `%${SPORT_FILTER.toLowerCase()}%`);
  }

  if (SINCE_FILTER) {
    conditions.push("substr(a.start_date, 1, 10) >= ?");
    params.push(SINCE_FILTER);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const activities = await queryAll(
    `SELECT a.id, a.user_id, a.name, a.sport_type, a.moving_time_min,
            a.average_heartrate, a.average_watts, a.rooka_score, a.start_date,
            a.is_hidden, a.linked_activity_id,
            u.username, u.email, u.subscription_tier, u.total_rooka, u.rooka_start_date
     FROM activities a
     LEFT JOIN users u ON u.id = a.user_id
     ${whereClause}
     ORDER BY a.user_id, a.start_date ASC`,
    params
  );

  if (activities.length === 0) {
    console.log("No activities found matching criteria.");
    process.exit(0);
  }

  console.log(`Found ${activities.length} activity record(s) across athletes.\nAnalyzing rooka points...`);

  // Tracking containers
  const athletesMap = new Map();
  const sportsMap = new Map();
  const changedActivities = [];
  const anomalies = [];

  let totalChangedCount = 0;
  let totalUnchangedCount = 0;
  let totalSkippedPreStart = 0;
  let totalHiddenCount = 0;

  for (const act of activities) {
    const userId = act.user_id;
    if (!athletesMap.has(userId)) {
      athletesMap.set(userId, {
        id: userId,
        username: act.username || `User #${userId}`,
        tier: act.subscription_tier || "free",
        startDate: act.rooka_start_date ? act.rooka_start_date.substring(0, 10) : "None",
        currentTotal: act.total_rooka || 0,
        filteredOldPoints: 0,
        filteredNewPoints: 0,
        recalculatedTotal: 0,
        activityCount: 0,
        changedCount: 0,
      });
    }
    const athlete = athletesMap.get(userId);
    athlete.activityCount++;

    const isHidden = act.is_hidden === 1;
    if (isHidden) {
      totalHiddenCount++;
    }

    const startDay = act.rooka_start_date ? act.rooka_start_date.substring(0, 10) : null;
    const actDay = act.start_date ? act.start_date.substring(0, 10) : null;
    const countsTowardsRooka = !startDay || (actDay && actDay >= startDay);

    if (!countsTowardsRooka) {
      totalSkippedPreStart++;
    }

    const standardSport = mapStravaSportToRooka(act.sport_type);

    // Compute expected score
    let expectedScore = 0;
    if (!isHidden && countsTowardsRooka) {
      expectedScore = await calculateRookaScoreZoned({
        userId,
        movingTimeMin: act.moving_time_min,
        avgHr: act.average_heartrate,
        avgWatts: act.average_watts,
        sport: standardSport,
      });
    }

    const prevScore = Number(act.rooka_score) || 0;
    const delta = Math.round((expectedScore - prevScore) * 10) / 10;

    // Track sport level stats
    if (!sportsMap.has(standardSport)) {
      sportsMap.set(standardSport, {
        sport: standardSport,
        count: 0,
        totalMinutes: 0,
        oldPoints: 0,
        newPoints: 0,
      });
    }
    const sportStat = sportsMap.get(standardSport);
    sportStat.count++;
    sportStat.totalMinutes += Number(act.moving_time_min) || 0;
    sportStat.oldPoints += prevScore;
    sportStat.newPoints += expectedScore;

    // Athlete running total
    if (!isHidden && countsTowardsRooka) {
      athlete.filteredOldPoints += prevScore;
      athlete.filteredNewPoints += expectedScore;
      athlete.recalculatedTotal += expectedScore;
    }

    // Check for anomalies
    if ((Number(act.moving_time_min) || 0) >= 5 && prevScore === 0 && !isHidden && countsTowardsRooka) {
      anomalies.push({
        id: act.id,
        user: athlete.username,
        sport: act.sport_type,
        time: act.moving_time_min,
        reason: "Active workout (>= 5 min) has 0 points stored",
      });
    }
    if (isNaN(prevScore)) {
      anomalies.push({
        id: act.id,
        user: athlete.username,
        sport: act.sport_type,
        time: act.moving_time_min,
        reason: "Stored rooka_score is NaN",
      });
    }

    if (Math.abs(delta) >= 0.1) {
      totalChangedCount++;
      athlete.changedCount++;
      changedActivities.push({
        id: act.id,
        userId: act.user_id,
        user: athlete.username,
        date: actDay || "Unknown",
        sport: standardSport,
        rawSport: act.sport_type,
        name: (act.name || `${standardSport} session`).slice(0, 30),
        timeMin: Math.round((act.moving_time_min || 0) * 10) / 10,
        avgHr: act.average_heartrate ? Math.round(act.average_heartrate) : "-",
        oldScore: prevScore,
        newScore: expectedScore,
        delta,
      });

      if (APPLY) {
        await queryRun(`UPDATE activities SET rooka_score = ? WHERE id = ?`, [expectedScore, act.id]);
      }
    } else {
      totalUnchangedCount++;
    }
  }

  // 1. SPORT BREAKDOWN
  console.log("\n================================================================================");
  console.log("📊 BREAKDOWN BY SPORT CATEGORY");
  console.log("================================================================================");
  const sportRows = Array.from(sportsMap.values()).map((s) => {
    const diff = Math.round((s.newPoints - s.oldPoints) * 10) / 10;
    const hours = Math.round((s.totalMinutes / 60) * 10) / 10;
    const oldPtsHr = hours > 0 ? Math.round(s.oldPoints / hours) : 0;
    const newPtsHr = hours > 0 ? Math.round(s.newPoints / hours) : 0;
    return {
      Sport: s.sport,
      Activities: s.count,
      "Total Hours": hours,
      "Current Pts": Math.round(s.oldPoints),
      "New Pts": Math.round(s.newPoints),
      Change: (diff > 0 ? "+" : "") + diff,
      "Rate (Pts/Hr)": `${oldPtsHr} -> ${newPtsHr}`,
    };
  });
  console.table(sportRows);

  // 2. ATHLETE BREAKDOWN
  console.log("\n================================================================================");
  console.log("👤 ATHLETE IMPACT & LEVEL SUMMARY");
  console.log("================================================================================");
  const isFiltered = Boolean(SPORT_FILTER || SINCE_FILTER);
  const athleteRows = Array.from(athletesMap.values()).map((a) => {
    const diff = Math.round((a.filteredNewPoints - a.filteredOldPoints) * 10) / 10;
    const estNewTotal = Math.max(0, Math.round(a.currentTotal + diff));
    const oldLevel = getRookaLevelInfo(a.currentTotal).level;
    const newLevel = getRookaLevelInfo(isFiltered ? estNewTotal : a.recalculatedTotal).level;

    if (isFiltered) {
      return {
        ID: a.id,
        Username: a.username,
        Tier: a.tier,
        "Matched Acts": a.activityCount,
        "Changed Acts": a.changedCount,
        "Filtered Old Pts": Math.round(a.filteredOldPoints),
        "Filtered New Pts": Math.round(a.filteredNewPoints),
        Delta: (diff > 0 ? "+" : "") + diff,
        "Current Total": Math.round(a.currentTotal),
        "Est New Total": estNewTotal,
        Level: oldLevel === newLevel ? `Lvl ${oldLevel}` : `Lvl ${oldLevel} -> ${newLevel}`,
      };
    }

    const net = Math.round((a.recalculatedTotal - a.currentTotal) * 10) / 10;
    return {
      ID: a.id,
      Username: a.username,
      Tier: a.tier,
      "Joined Rooka": a.startDate,
      Activities: a.activityCount,
      "Changed Acts": a.changedCount,
      "Current Total": Math.round(a.currentTotal),
      "New Total": Math.round(a.recalculatedTotal),
      Net: (net > 0 ? "+" : "") + net,
      Level: oldLevel === newLevel ? `Lvl ${oldLevel}` : `Lvl ${oldLevel} -> ${newLevel}`,
    };
  });
  console.table(athleteRows);

  // 3. SAMPLE / TOP CHANGED ACTIVITIES
  if (changedActivities.length > 0) {
    // Sort by largest absolute delta descending
    changedActivities.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    const sliceCount = ALL_DIFFS ? changedActivities.length : Math.min(LIMIT_ROWS, changedActivities.length);
    console.log("\n================================================================================");
    console.log(`📋 ${ALL_DIFFS ? "ALL" : "TOP " + sliceCount} CHANGED ACTIVITIES (Sorted by magnitude of change)`);
    console.log("================================================================================");
    console.table(
      changedActivities.slice(0, sliceCount).map((c) => ({
        ID: c.id,
        Athlete: c.user,
        Date: c.date,
        Sport: c.sport,
        Name: c.name,
        "Min": c.timeMin,
        HR: c.avgHr,
        "Old Pts": c.oldScore,
        "New Pts": c.newScore,
        Delta: (c.delta > 0 ? "+" : "") + c.delta,
      }))
    );
    if (!ALL_DIFFS && changedActivities.length > sliceCount) {
      console.log(`... and ${changedActivities.length - sliceCount} more changed activities. Use --all to list all.`);
    }
  }

  // 4. ANOMALIES
  if (anomalies.length > 0) {
    console.log("\n================================================================================");
    console.log(`⚠️ DETECTED ANOMALIES (${anomalies.length})`);
    console.log("================================================================================");
    console.table(anomalies.slice(0, 10));
  }

  // 5. SUMMARY
  console.log("\n================================================================================");
  console.log("🏁 OVERALL AUDIT SUMMARY");
  console.log("================================================================================");
  console.log(`Total activities analyzed:   ${activities.length}`);
  console.log(`Activities with score shift: ${totalChangedCount}`);
  console.log(`Activities unchanged:        ${totalUnchangedCount}`);
  console.log(`Pre-onboarding activities:   ${totalSkippedPreStart} (kept at 0 rooka)`);
  console.log(`Hidden/merged duplicates:    ${totalHiddenCount} (kept at 0 rooka)`);

  if (!APPLY) {
    console.log("\n🔒 STATUS: DRY RUN COMPLETE. No changes were written to the database.");
    console.log("👉 To write these updated scores and refresh athlete levels, run:");
    console.log("   node scripts/check-past-activities.js --apply" + (USER_FILTER ? ` --user=${USER_FILTER}` : ""));
  } else {
    console.log("\n💾 Updating athlete total points and level benchmarks...");
    for (const [uid] of athletesMap) {
      updateUserRookaAndCheckLevel(uid, { isRealtime: false });
    }
    console.log("✅ Database successfully updated! Athlete levels refreshed.");
  }

  setTimeout(() => process.exit(0), 1000);
})().catch((err) => {
  console.error("Audit script encountered an error:", err);
  process.exit(1);
});
