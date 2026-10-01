const path = require("path");
const sqlite3 = require("sqlite3").verbose();

// Support custom DB_PATH or fallback to rooka_multi.db / rooka_native.db
const dbFiles = [
  process.env.DB_PATH ? path.resolve(__dirname, "..", process.env.DB_PATH) : null,
  path.join(__dirname, "..", "rooka_multi.db"),
  path.join(__dirname, "..", "rooka_native.db"),
  path.join(__dirname, "..", "..", "rooka_multi.db"),
  path.join(__dirname, "..", "..", "rooka_native.db")
].filter(Boolean);

async function processDb(dbPath) {
  const fs = require("fs");
  if (!fs.existsSync(dbPath)) return;

  console.log(`\n========================================`);
  console.log(`Inspecting Database: ${dbPath}`);
  console.log(`========================================`);

  const db = new sqlite3.Database(dbPath);

  return new Promise((resolve) => {
    // 1. Find user Tharaka
    db.all(
      `SELECT id, username, total_rooka FROM users WHERE LOWER(username) LIKE '%tharaka%'`,
      async (err, users) => {
        if (err || !users || users.length === 0) {
          console.log(`No user matching 'tharaka' found in this database.`);
          db.close();
          return resolve();
        }

        for (const user of users) {
          console.log(`Found user: ${user.username} (ID: ${user.id}, Current Total Rooka: ${user.total_rooka})`);

          // 2. Query activities on 2026-09-22
          db.all(
            `SELECT id, name, sport_type, distance_km, moving_time_min, average_heartrate, max_heartrate, average_watts, elevation_m, polyline, laps_json, strava_activity_id, rooka_score, is_hidden, linked_activity_id, start_date
             FROM activities 
             WHERE user_id = ? AND substr(start_date, 1, 10) = '2026-09-22'`,
            [user.id],
            (actErr, acts) => {
              if (actErr || !acts || acts.length === 0) {
                console.log(`No activities found for user ${user.username} on 2026-09-22.`);
                return;
              }

              console.log(`Activities found on 2026-09-22 (${acts.length} total):`);
              acts.forEach((a) => {
                console.log(` - [ID ${a.id}] "${a.name}" (${a.sport_type}) | Dist: ${a.distance_km}km | Time: ${a.moving_time_min}m | Rooka: ${a.rooka_score} | Hidden: ${a.is_hidden} | LinkedTo: ${a.linked_activity_id}`);
              });

              // Look for hockey training (target) and run (source)
              const hockeyAct = acts.find(a => (a.name && a.name.toLowerCase().includes('hockey')) || (a.sport_type && a.sport_type.toLowerCase().includes('hockey')));
              const runAct = acts.find(a => (a.name && a.name.toLowerCase().includes('run')) || (a.sport_type && a.sport_type.toLowerCase().includes('run')));

              if (!hockeyAct) {
                console.log(`Could not find a Field Hockey Training activity on 2026-09-22.`);
                return;
              }
              if (!runAct) {
                console.log(`Could not find an Evening Run activity on 2026-09-22.`);
                return;
              }

              if (runAct.id === hockeyAct.id) {
                console.log(`Hockey and Run have the same activity ID!`);
                return;
              }

              console.log(`\nLinking Evening Run (ID: ${runAct.id}) -> Field Hockey Training (ID: ${hockeyAct.id})...`);

              // 3. Transfer run telemetry to hockey
              const updatedDist = runAct.distance_km || hockeyAct.distance_km;
              const updatedTime = runAct.moving_time_min || hockeyAct.moving_time_min;
              const updatedHr = runAct.average_heartrate || hockeyAct.average_heartrate;
              const updatedMaxHr = runAct.max_heartrate || hockeyAct.max_heartrate;
              const updatedWatts = runAct.average_watts || hockeyAct.average_watts;
              const updatedElev = runAct.elevation_m || hockeyAct.elevation_m;
              const updatedPolyline = runAct.polyline || hockeyAct.polyline;
              const updatedLaps = runAct.laps_json || hockeyAct.laps_json;
              const updatedStravaId = runAct.strava_activity_id || hockeyAct.strava_activity_id;

              db.run(
                `UPDATE activities SET 
                   distance_km = ?,
                   moving_time_min = ?,
                   average_heartrate = ?,
                   max_heartrate = ?,
                   average_watts = ?,
                   elevation_m = ?,
                   polyline = ?,
                   laps_json = ?,
                   strava_activity_id = ?,
                   linked_activity_id = ?,
                   linked_activity_name = ?
                 WHERE id = ?`,
                [
                  updatedDist,
                  updatedTime,
                  updatedHr,
                  updatedMaxHr,
                  updatedWatts,
                  updatedElev,
                  updatedPolyline,
                  updatedLaps,
                  updatedStravaId,
                  runAct.id,
                  runAct.name || "Evening Run",
                  hockeyAct.id
                ],
                (uErr) => {
                  if (uErr) {
                    console.error(`Error updating Field Hockey Training:`, uErr);
                    return;
                  }

                  // 4. Hide run and set rooka_score to 0
                  db.run(
                    `UPDATE activities SET is_hidden = 1, rooka_score = 0, linked_activity_id = ? WHERE id = ?`,
                    [hockeyAct.id, runAct.id],
                    (hErr) => {
                      if (hErr) {
                        console.error(`Error hiding Evening Run:`, hErr);
                        return;
                      }

                      console.log(`Successfully merged telemetry into Field Hockey Training and hid Evening Run.`);

                      // 5. Recalculate total rooka
                      db.get(
                        `SELECT COALESCE(SUM(rooka_score), 0) as act_total 
                         FROM activities 
                         WHERE user_id = ? AND (is_hidden IS NULL OR is_hidden = 0)`,
                        [user.id],
                        (totErr, totRow) => {
                          const newActTotal = totRow ? totRow.act_total : 0;
                          db.get(
                            `SELECT COALESCE(SUM(amount), 0) as bonus_total FROM bonus_points WHERE user_id = ?`,
                            [user.id],
                            (bErr, bRow) => {
                              const newBonusTotal = bRow ? bRow.bonus_total : 0;
                              const newTotal = Math.round((newActTotal + newBonusTotal) * 10) / 10;
                              db.run(
                                `UPDATE users SET total_rooka = ? WHERE id = ?`,
                                [newTotal, user.id],
                                (updUserErr) => {
                                  if (updUserErr) {
                                    console.error(`Error updating user total_rooka:`, updUserErr);
                                  } else {
                                    console.log(`✅ Tharaka's total_rooka updated from ${user.total_rooka} to ${newTotal} (Deducted excess duplicate points).`);
                                  }
                                }
                              );
                            }
                          );
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        }

        setTimeout(() => {
          db.close();
          resolve();
        }, 1500);
      }
    );
  });
}

async function main() {
  for (const p of dbFiles) {
    await processDb(p);
  }
  console.log(`\nFinished running link migration.`);
}

main().catch(console.error);
