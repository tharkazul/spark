const assert = require("assert");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const testDbPath = path.join(__dirname, "test_linking.db");
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

const db = new sqlite3.Database(testDbPath);

console.log("🏃 Running Activity Linking & Deduplication unit tests...");

db.serialize(async () => {
  // 1. Create schema
  db.run(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    username TEXT UNIQUE, 
    total_rooka REAL DEFAULT 0,
    rooka_start_date TEXT
  )`);

  db.run(`CREATE TABLE bonus_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    amount REAL,
    created_at TEXT
  )`);

  db.run(`CREATE TABLE activities (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    name TEXT,
    sport_type TEXT,
    distance_km REAL,
    elevation_m INTEGER,
    moving_time_min REAL,
    average_heartrate REAL,
    max_heartrate REAL,
    average_watts REAL,
    polyline TEXT,
    laps_json TEXT,
    strava_activity_id TEXT,
    start_date TEXT,
    rooka_score REAL,
    is_hidden INTEGER DEFAULT 0,
    linked_activity_id INTEGER,
    linked_activity_name TEXT
  )`);

  // 2. Insert test user Tharaka
  db.run(`INSERT INTO users (id, username, total_rooka, rooka_start_date) VALUES (1, 'Tharaka', 104, '2026-09-01')`);

  // 3. Insert Field Hockey Training and Evening Run on 2026-09-22
  db.run(`INSERT INTO activities (id, user_id, name, sport_type, distance_km, moving_time_min, start_date, rooka_score) 
          VALUES (-1001, 1, 'Field Hockey Training', 'Hockey', 0, 60, '2026-09-22T17:00:00Z', 52)`);

  db.run(`INSERT INTO activities (id, user_id, name, sport_type, distance_km, moving_time_min, average_heartrate, polyline, start_date, rooka_score) 
          VALUES (2001, 1, 'Evening Run', 'Run', 4.5, 43, 148, 'u{~vFvyys@_c@...', '2026-09-22T18:30:00Z', 52)`);

  // Verify before link
  db.all(`SELECT * FROM activities WHERE user_id = 1 AND (is_hidden IS NULL OR is_hidden = 0)`, (err, rows) => {
    assert.strictEqual(rows.length, 2, "Before link, both activities must be visible");
    console.log("✅ Step 1 Passed: Both activities initially present");

    // 4. Perform Linking: Evening Run (source: 2001) -> Field Hockey Training (target: -1001)
    const target = rows.find(r => r.id === -1001);
    const source = rows.find(r => r.id === 2001);

    db.run(
      `UPDATE activities SET 
         distance_km = ?,
         moving_time_min = ?,
         average_heartrate = ?,
         polyline = ?,
         linked_activity_id = ?,
         linked_activity_name = ?
       WHERE id = ?`,
      [
        source.distance_km,
        source.moving_time_min,
        source.average_heartrate,
        source.polyline,
        source.id,
        source.name,
        target.id
      ],
      () => {
        db.run(
          `UPDATE activities SET is_hidden = 1, rooka_score = 0, linked_activity_id = ? WHERE id = ?`,
          [target.id, source.id],
          () => {
            // Recalculate user total
            db.get(
              `SELECT COALESCE(SUM(rooka_score), 0) as act_total FROM activities WHERE user_id = 1 AND (is_hidden IS NULL OR is_hidden = 0)`,
              (totErr, totRow) => {
                const newTotal = totRow.act_total;
                db.run(`UPDATE users SET total_rooka = ? WHERE id = 1`, [newTotal], () => {
                  // Verify target activity received telemetry
                  db.get(`SELECT * FROM activities WHERE id = -1001`, (tErr, updatedTarget) => {
                    assert.strictEqual(updatedTarget.distance_km, 4.5, "Target must have run distance (4.5 km)");
                    assert.strictEqual(updatedTarget.moving_time_min, 43, "Target must have run moving time (43 min)");
                    assert.strictEqual(updatedTarget.average_heartrate, 148, "Target must have run HR (148 bpm)");
                    assert.strictEqual(updatedTarget.polyline, 'u{~vFvyys@_c@...', "Target must have run polyline");
                    assert.strictEqual(updatedTarget.linked_activity_id, 2001, "Target must record linked ID");
                    assert.strictEqual(updatedTarget.rooka_score, 52, "Target must keep its 52 points");
                    console.log("✅ Step 2 Passed: Target activity correctly absorbed run telemetry");

                    // Verify source activity is hidden with 0 score
                    db.get(`SELECT * FROM activities WHERE id = 2001`, (sErr, updatedSource) => {
                      assert.strictEqual(updatedSource.is_hidden, 1, "Source must be marked hidden");
                      assert.strictEqual(updatedSource.rooka_score, 0, "Source score must be 0");
                      assert.strictEqual(updatedSource.linked_activity_id, -1001, "Source must link to target");
                      console.log("✅ Step 3 Passed: Source activity is hidden with 0 points");

                      // Verify user total rooka points
                      db.get(`SELECT total_rooka FROM users WHERE id = 1`, (uErr, userRow) => {
                        assert.strictEqual(userRow.total_rooka, 52, "User total points must be 52 (excess 52 points deducted)");
                        console.log("✅ Step 4 Passed: Tharaka's total rooka points accurately reduced to 52");

                        // Verify social feed query excludes hidden activity
                        db.all(`SELECT * FROM activities WHERE user_id = 1 AND (is_hidden IS NULL OR is_hidden = 0)`, (fErr, feedActs) => {
                          assert.strictEqual(feedActs.length, 1, "Feed query must only return 1 activity");
                          assert.strictEqual(feedActs[0].name, "Field Hockey Training", "Visible activity must be Field Hockey Training");
                          assert.strictEqual(feedActs[0].distance_km, 4.5, "Visible activity must have 4.5 km");
                          console.log("✅ Step 5 Passed: Feed query returns only 1 merged Field Hockey session");

                          // Cleanup
                          db.close(() => {
                            fs.unlinkSync(testDbPath);
                            console.log("\n🎉 All Activity Linking & Deduplication unit tests passed successfully!");
                          });
                        });
                      });
                    });
                  });
                });
              }
            );
          }
        );
      }
    );
  });
});
