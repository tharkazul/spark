// Erasing an athlete: every row that carries their id, the RevenueCat link and the
// files they uploaded. Used by the athlete's own "Delete account" and by the admin
// delete, so both leave the same nothing behind.
const path = require("path");
const fs = require("fs");
const db = require("./db");

const TABLES_WITH_USER_ID = [
    "activities", "activity_comments", "micro_plan", "deleted_micro_plan",
    "weight_log", "chat_history", "athlete_metrics", "athlete_muscle_status",
    "user_daily_metrics", "user_quests", "completed_quests", "user_xp",
    "nutrition_protocols", "nutrition_intake", "daily_diet_logs", "biometrics",
    "physique_logs", "milestones", "kudos", "public_profile_cache",
    "completed_micro_steps", "push_subscriptions", "push_tokens",
    "garmin_health_data", "user_titles", "athlete_niggles", "bonus_points",
    "recurring_trainings", "benchmark_tests", "athlete_zones", "strava_tokens",
    "suunto_tokens", "suunto_guides", "garmin_tokens", "garmin_oauth_pending", "garmin_workouts",
    "trainerday_tokens", "trainerday_events",
    "discount_redemptions", "user_discounts", "user_milestone_history",
    "user_feature_onboarding", "password_resets", "athlete_facts",
    "live_sessions", "athlete_constraints", "season_weeks", "season_meta",
    "athlete_topics", "feedback", "race_plans", "race_moments"
];

// Every file an athlete can leave on disk carries their id right after the prefix.
// chat.js has saved chat images both under server/secure_uploads and (by an older
// path bug) under server/routes/secure_uploads, so both are swept.
const USER_UPLOADS = [
    ["../public/uploads/profiles", "profile_"],
    ["../public/uploads/coaches", "coach_"],
    ["../public/uploads/milestones", "milestone_"],
    ["../secure_uploads/physique", "physique_"],
    ["../secure_uploads/chat_images", "img_"],
    ["../routes/secure_uploads/chat_images", "img_"],
    ["../secure_uploads/feedback", "fb_"],
];

function removeUserUploads(userId) {
    for (const [relDir, prefix] of USER_UPLOADS) {
        const dir = path.join(__dirname, relDir);
        const ownPrefix = `${prefix}${userId}_`;
        let names;
        try {
            names = fs.readdirSync(dir);
        } catch (e) {
            if (e.code !== "ENOENT") console.error(`Could not list ${dir} on account delete:`, e.message);
            continue;
        }
        for (const name of names) {
            if (!name.startsWith(ownPrefix)) continue;
            fs.unlink(path.join(dir, name), (e) => {
                if (e && e.code !== "ENOENT") console.error(`Could not remove ${name} on account delete:`, e.message);
            });
        }
    }
}

// Resolves once the users row is gone; rejects (after a rollback) if it could not be deleted.
async function eraseAccount(userId) {
    // End the OAuth links on the other side while the tokens still exist. Garmin
    // requires the deregistration call when an athlete deletes their account.
    for (const [name, service] of [['Garmin', './garmin'], ['TrainerDay', './trainerday']]) {
        try {
            await require(service).disconnect(userId);
        } catch (e) {
            console.error(`${name} disconnect on account delete failed:`, e.message);
        }
    }

    await new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");

            TABLES_WITH_USER_ID.forEach(table => {
                db.run(`DELETE FROM ${table} WHERE user_id = ?`, [userId], function(err) {
                    if (err && !err.message.includes("no such table")) {
                        console.error(`Error deleting from ${table}:`, err.message);
                    }
                });
            });

            db.run(`DELETE FROM connections WHERE user_id = ? OR friend_id = ?`, [userId, userId], function(err) {
                if (err && !err.message.includes("no such table")) console.error("Error deleting connections:", err.message);
            });

            db.run(`DELETE FROM event_invitations WHERE inviter_id = ? OR invitee_id = ?`, [userId, userId], function(err) {
                if (err && !err.message.includes("no such table")) console.error("Error deleting event_invitations:", err.message);
            });

            // The event ids stay so RevenueCat retries are still recognised; only the link to the athlete goes.
            db.run(`UPDATE revenuecat_events SET app_user_id = NULL WHERE app_user_id = ?`, [String(userId)], function(err) {
                if (err && !err.message.includes("no such table")) console.error("Error unlinking revenuecat_events:", err.message);
            });

            db.run(`DELETE FROM users WHERE id = ?`, [userId], function (err) {
                if (err) {
                    console.error("Error deleting user:", err.message);
                    db.run("ROLLBACK");
                    return reject(err);
                }
                db.run("COMMIT", function(err) {
                    if (err) return reject(err);
                    resolve();
                });
            });
        });
    });

    removeUserUploads(userId);
}

module.exports = { eraseAccount, removeUserUploads, TABLES_WITH_USER_ID };
