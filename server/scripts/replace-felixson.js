const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const db = require("../services/db");
const { createSnapshot } = require("../services/backup");

async function main() {
  console.log("==================================================");
  console.log("   Rooka Account Migration: FelixSon2 -> FelixSon  ");
  console.log("==================================================\n");

  // 1. Create a snapshot backup before making changes
  try {
    console.log("📸 Creating database snapshot backup...");
    const snapshot = await createSnapshot("before_felixson_migration");
    console.log(`✅ Backup created: ${snapshot.filepath}\n`);
  } catch (err) {
    console.warn("⚠️ Warning: Snapshot backup failed, proceeding with caution:", err.message);
  }

  // 2. Identify the accounts
  const oldUser = await new Promise((resolve, reject) => {
    db.get(
      `SELECT id, username, email, subscription_tier, role 
       FROM users 
       WHERE LOWER(username) = 'felixson' AND username != 'FelixSon2'`,
      (err, row) => (err ? reject(err) : resolve(row))
    );
  });

  const newUser = await new Promise((resolve, reject) => {
    db.get(
      `SELECT id, username, email, subscription_tier, role 
       FROM users 
       WHERE LOWER(username) = 'felixson2'`,
      (err, row) => (err ? reject(err) : resolve(row))
    );
  });

  console.log("User Lookup Result:");
  if (oldUser) {
    console.log(`  - Old Account: ${oldUser.username} (ID: ${oldUser.id}, Email: ${oldUser.email || 'None'}, Tier: ${oldUser.subscription_tier})`);
  } else {
    console.log("  - Old Account 'FelixSon': Not found (may already be deleted).");
  }

  if (newUser) {
    console.log(`  - Target Account: ${newUser.username} (ID: ${newUser.id}, Email: ${newUser.email || 'None'}, Tier: ${newUser.subscription_tier})\n`);
  } else {
    console.error("❌ Error: Could not find user with username 'FelixSon2'. Aborting.");
    process.exit(1);
  }

  const tablesWithUserId = [
    "activities", "micro_plan", "micro_plan_new", "weight_log", "chat_history", 
    "athlete_metrics", "user_daily_metrics", "user_quests", 
    "completed_quests", "user_xp", "nutrition_protocols", 
    "nutrition_intake", "daily_diet_logs", "biometrics",
    "physique_logs", "milestones", "kudos", "public_profile_cache", 
    "completed_micro_steps", "push_subscriptions", "push_tokens", 
    "strava_tokens", "athlete_zones", "garmin_sync_state", "user_daily_recovery",
    "garmin_health_data", "user_titles", "athlete_niggles", "bonus_points"
  ];

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    // 3. Delete old FelixSon account if it exists
    if (oldUser) {
      console.log(`🗑️ Deleting all records for old account ${oldUser.username} (ID: ${oldUser.id})...`);
      for (const table of tablesWithUserId) {
        db.run(`DELETE FROM ${table} WHERE user_id = ?`, [oldUser.id], (err) => {
          if (err && !err.message.includes("no such table")) {
            console.warn(`  [Note on ${table}]:`, err.message);
          }
        });
      }

      db.run(`DELETE FROM connections WHERE user_id = ? OR friend_id = ?`, [oldUser.id, oldUser.id]);
      db.run(`DELETE FROM users WHERE id = ?`, [oldUser.id]);
    }

    // 4. Determine if admin privileges should be transferred
    const shouldBeAdmin = (oldUser && (oldUser.subscription_tier === "admin" || oldUser.role === "admin")) ||
                          newUser.subscription_tier === "admin" || newUser.role === "admin";

    const newTier = shouldBeAdmin ? "admin" : (newUser.subscription_tier || "free");
    const newRole = shouldBeAdmin ? "admin" : (newUser.role || "user");
    const newLimit = shouldBeAdmin ? 500000 : undefined;

    console.log(`✏️ Renaming ${newUser.username} (ID: ${newUser.id}) -> FelixSon...`);
    if (shouldBeAdmin) {
      console.log(`🛡️ Ensuring admin privileges (tier='admin', role='admin', daily_token_limit=500000)...`);
      db.run(
        `UPDATE users SET username = 'FelixSon', subscription_tier = ?, role = ?, daily_token_limit = COALESCE(?, daily_token_limit) WHERE id = ?`,
        [newTier, newRole, newLimit, newUser.id],
        function (err) {
          if (err) {
            console.error("❌ Failed to update user:", err.message);
            db.run("ROLLBACK");
            process.exit(1);
          }
        }
      );
    } else {
      db.run(
        `UPDATE users SET username = 'FelixSon' WHERE id = ?`,
        [newUser.id],
        function (err) {
          if (err) {
            console.error("❌ Failed to update username:", err.message);
            db.run("ROLLBACK");
            process.exit(1);
          }
        }
      );
    }

    // Clear cached social profiles so the rename displays immediately
    db.run(`DELETE FROM public_profile_cache WHERE user_id = ?`, [newUser.id]);

    db.run("COMMIT", (commitErr) => {
      if (commitErr) {
        console.error("❌ Failed to commit transaction:", commitErr.message);
        process.exit(1);
      }

      console.log("\n==================================================");
      console.log("🎉 Successfully migrated account!");
      if (oldUser) {
        console.log(`✅ Old account '${oldUser.username}' (ID: ${oldUser.id}) has been removed.`);
      }
      console.log(`✅ Account '${newUser.username}' (ID: ${newUser.id}) is now 'FelixSon'.`);
      console.log("Felix can now log in using 'FelixSon' and their current password.");
      console.log("==================================================\n");
      process.exit(0);
    });
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
