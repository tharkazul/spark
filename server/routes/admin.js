const express = require("express");
const { resolveCoachName } = require("../services/coachPersona");
const router = express.Router();
const db = require("../services/db");
const { authenticateToken } = require("../services/auth");
const { getUserLeaderboardString } = require("../services/utils");
const { generateWithFallback } = require("../services/ai");
const { sendSSEEvent } = require("../services/sse");
const { eraseAccount } = require("../services/accountDeletion");

// Admin access comes only from users.role = 'admin' (re-read from the database by
// authenticateToken). Grant it with scripts/grant-admin.js.
const adminAuthMiddleware = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Unauthorized: Admin access required" });
  }
  next();
};

router.use("/api/admin", authenticateToken, adminAuthMiddleware);

router.post("/api/admin/simulate-24h", authenticateToken, async (req, res) => {
  const user = req.user;
  console.log(`🤖 Simulating 24h inactivity for user ${user.id}...`);

  db.get(
    `SELECT coach_tone, coach_name FROM users WHERE id = ?`,
    [user.id],
    async (err, row) => {
      const lbString = await getUserLeaderboardString(user.id);
      const prompt = `The user has not logged any activities or sent any messages in over 24 hours. Write a short, proactive message checking in on them and asking how their training is going. Use the tone: ${row ? row.coach_tone : "Friendly and motivating"}. Keep it under 2 sentences. If applicable, playfully use their standing on the leaderboard to motivate them: ${lbString}`;
      try {
        const systemPrompt = `You are ${resolveCoachName(row)}, an elite endurance coach. Your tone is: ${row ? row.coach_tone : "Friendly and motivating"}. Act like a real human in a continuous text message thread.`;
        const aiReply = await generateWithFallback(prompt, systemPrompt);
        db.run(
          `INSERT INTO chat_history (user_id, role, content, mood) VALUES (?, 'coach', ?, 'curious')`,
          [user.id, aiReply],
          (err) => {
             if (err) { console.error(err); return; }
             sendSSEEvent(user.id, "unread_message", {
               message: aiReply,
               mood: "curious",
             });
          }
        );
        res.json({ success: true, message: "Trigger fired." });
      } catch (e) {
        console.error("Simulated AI generation failed:", e);
        res.status(500).json({ error: "Failed" });
      }
    },
  );
});

router.post("/api/admin/trigger-morning", authenticateToken, async (req, res) => {
  const { sendMorningMessage } = require("../services/utils");
  console.log(`🤖 Admin triggering morning message job...`);
  try {
    await sendMorningMessage();
    res.json({ success: true, message: "Morning message job triggered!" });
  } catch (e) {
    console.error("Admin trigger morning failed:", e);
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/api/admin/usage", authenticateToken, (req, res) => {
  const query = `
        SELECT 
            u.id,
            u.username, 
            u.login_count, 
            u.chat_count,
            u.daily_token_usage,
            u.common_token_usage,
            u.daily_token_limit,
            u.subscription_tier,
            u.last_token_reset_date,
            u.rooka_plus_clicks,
            u.data_request_clicks,
            CASE WHEN u.strava_refresh_token IS NOT NULL AND u.strava_refresh_token != '' THEN 1 ELSE 0 END as strava_connected,
            CASE WHEN EXISTS (SELECT 1 FROM garmin_tokens WHERE user_id = u.id) THEN 1 ELSE 0 END as garmin_connected,
            CASE WHEN EXISTS (SELECT 1 FROM suunto_tokens WHERE user_id = u.id) THEN 1 ELSE 0 END as suunto_connected,
            CASE WHEN COALESCE(u.apple_health_connected, 0) = 1
                   OR EXISTS (SELECT 1 FROM activities WHERE user_id = u.id AND healthkit_workout_id IS NOT NULL)
                   OR EXISTS (SELECT 1 FROM biometrics WHERE user_id = u.id AND COALESCE(from_garmin, 0) = 0 AND (sleep_minutes > 0 OR hrv_sdnn > 0 OR steps > 0 OR resting_hr > 0 OR active_calories > 0 OR vo2_max > 0))
                 THEN 1 ELSE 0 END as apple_health_connected,
            CASE WHEN COALESCE(u.apple_watch_connected, 0) = 1
                   OR EXISTS (SELECT 1 FROM activities WHERE user_id = u.id AND (LOWER(name) LIKE '%apple watch%' OR LOWER(linked_activity_name) LIKE '%apple watch%'))
                   OR EXISTS (SELECT 1 FROM biometrics WHERE user_id = u.id AND COALESCE(from_garmin, 0) = 0 AND (hrv_sdnn > 0 OR sleep_deep_minutes > 0 OR sleep_rem_minutes > 0 OR sleep_core_minutes > 0))
                 THEN 1 ELSE 0 END as apple_watch_connected,
            (SELECT COUNT(*) FROM activities WHERE user_id = u.id) as activities_count
        FROM users u
        WHERE u.deleted_at IS NULL
        ORDER BY u.login_count DESC
    `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: "Database error" });
    const { getEffectiveTokenLimit, getAMSDateString } = require('../services/utils');
    const todayStr = getAMSDateString();
    const enrichedRows = rows.map(r => {
      if (r.last_token_reset_date !== todayStr) {
        r.daily_token_usage = 0;
        r.common_token_usage = 0;
      }
      r.effective_limit = getEffectiveTokenLimit(r);
      return r;
    });
    res.json(enrichedRows);
  });
});

router.get("/api/admin/token-stats", authenticateToken, (req, res) => {
  const { getAMSDateString } = require("../services/utils");
  const requestedDays = parseInt(req.query.days, 10);
  const numDays = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;
  const todayStr = getAMSDateString();

  const dateList = [];
  const baseDate = new Date(`${todayStr}T12:00:00Z`);
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(baseDate.getTime() - i * 86400000);
    dateList.push(d.toISOString().slice(0, 10));
  }
  const startDate = dateList[0];

  db.all(
    `SELECT date, total_tokens, paid_tokens, free_tokens, cached_tokens,
            uncached_input_tokens, output_tokens, request_count, cache_hit_count
       FROM token_usage_daily
      WHERE date >= ? AND date <= ?
      ORDER BY date ASC`,
    [startDate, todayStr],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Database error" });

      db.get(
        `SELECT COALESCE(SUM(COALESCE(daily_token_usage, 0) + COALESCE(common_token_usage, 0)), 0) AS live_paid_today
           FROM users
          WHERE last_token_reset_date = ? AND deleted_at IS NULL`,
        [todayStr],
        (uErr, uRow) => {
          const livePaidToday = !uErr && uRow ? Number(uRow.live_paid_today) || 0 : 0;
          const byDate = new Map((rows || []).map((r) => [r.date, r]));

          const days = dateList.map((date) => {
            const r = byDate.get(date) || {};
            let paid = Number(r.paid_tokens) || 0;
            const free = Number(r.free_tokens) || 0;
            if (date === todayStr && livePaidToday > paid) {
              paid = livePaidToday;
            }
            const total = Math.max(Number(r.total_tokens) || 0, paid + free);
            return {
              date,
              total_tokens: total,
              paid_tokens: paid,
              free_tokens: free,
              cached_tokens: Number(r.cached_tokens) || 0,
              uncached_input_tokens: Number(r.uncached_input_tokens) || 0,
              output_tokens: Number(r.output_tokens) || 0,
              request_count: Number(r.request_count) || 0,
              cache_hit_count: Number(r.cache_hit_count) || 0,
            };
          });

          const todayEntry = days[days.length - 1] || {
            date: todayStr,
            total_tokens: 0,
            paid_tokens: 0,
            free_tokens: 0,
            cached_tokens: 0,
            request_count: 0,
            cache_hit_count: 0,
          };

          const totals = days.reduce(
            (acc, d) => {
              acc.total_tokens += d.total_tokens;
              acc.paid_tokens += d.paid_tokens;
              acc.free_tokens += d.free_tokens;
              acc.cached_tokens += d.cached_tokens;
              acc.request_count += d.request_count;
              acc.cache_hit_count += d.cache_hit_count;
              return acc;
            },
            {
              total_tokens: 0,
              paid_tokens: 0,
              free_tokens: 0,
              cached_tokens: 0,
              request_count: 0,
              cache_hit_count: 0,
            },
          );

          res.json({
            rangeDays: numDays,
            today: {
              ...todayEntry,
              savings_pct:
                todayEntry.total_tokens > 0
                  ? Math.round((todayEntry.free_tokens / todayEntry.total_tokens) * 1000) / 10
                  : 0,
            },
            totals: {
              ...totals,
              savings_pct:
                totals.total_tokens > 0
                  ? Math.round((totals.free_tokens / totals.total_tokens) * 1000) / 10
                  : 0,
            },
            days,
          });
        },
      );
    },
  );
});

router.post("/api/admin/add-tokens", authenticateToken, (req, res) => {
  const { targetUsername } = req.body;
  if (!targetUsername) return res.status(400).json({ error: "Missing username" });

  db.run(
    `UPDATE users SET daily_token_limit = COALESCE(daily_token_limit, 50000) + 50000 WHERE username = ? AND deleted_at IS NULL`,
    [targetUsername],
    function (err) {
      if (err) return res.status(500).json({ error: "Database error" });
      if (this.changes === 0) return res.status(404).json({ error: "User not found or deleted" });
      
      db.run(
        `INSERT INTO audit_logs (admin_username, action, target_username, details) VALUES (?, 'add_tokens', ?, '+50000 tokens')`,
        [req.user.username, targetUsername]
      );
      
      res.json({ success: true, message: "Added 50k tokens to limit." });
    },
  );
});

router.delete("/api/admin/delete-user/:targetUsername", authenticateToken, (req, res) => {
  const { targetUsername } = req.params;
  if (!targetUsername) return res.status(400).json({ error: "Missing username" });
  
  // Removed hardcoded admin deletion block to allow resetting accounts

  // A full erase, the same as the athlete's own "Delete account". Accounts that were
  // soft-deleted before this match on their renamed username, so they can be erased too.
  db.get(`SELECT id FROM users WHERE username = ?`, [targetUsername], async (err, user) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!user) return res.status(404).json({ error: "User not found" });

    try {
      await eraseAccount(user.id);
    } catch (e) {
      return res.status(500).json({ error: "Failed to delete account" });
    }

    db.run(
      `INSERT INTO audit_logs (admin_username, action, target_username, details) VALUES (?, 'delete_user', ?, ?)`,
      [req.user.username, targetUsername, `Account erased (user id ${user.id})`]
    );

    res.json({ success: true, message: "Account deleted." });
  });
});

router.post("/api/admin/set-tier", authenticateToken, (req, res) => {

    const { targetUsername, tier } = req.body;
    if (!targetUsername || !tier) return res.status(400).json({ error: "Missing parameters" });

    // Set tier, and automatically adjust daily_token_limit so it takes effect immediately
    let limit = 10000; // Free
    if (tier === 'rooka_plus') limit = 50000;
    else if (tier === 'premium') limit = 100000;
    else if (tier === 'admin') limit = 500000;

    db.get(`SELECT id, subscription_tier FROM users WHERE username = ?`, [targetUsername], (errUser, userRow) => {
        if (errUser || !userRow) return res.status(404).json({ error: "User not found" });

        const previousTier = userRow.subscription_tier || 'free';

        db.run(
            `UPDATE users SET subscription_tier = ?, daily_token_limit = ? WHERE username = ?`,
            [tier, limit, targetUsername],
            function (err) {
                if (err) return res.status(500).json({ error: "Database error" });
                if (this.changes === 0) return res.status(404).json({ error: "User not found" });

                // If upgraded from free to subscriber tier, assign first quest: "Log a single activity"
                if (previousTier === 'free' && tier !== 'free') {
                    db.run(`UPDATE user_quests SET status = 'closed' WHERE user_id = ? AND status = 'active'`, [userRow.id], () => {
                        const nowIso = new Date().toISOString().replace("T", " ").substring(0, 19);
                        db.run(
                            `INSERT INTO user_quests (user_id, description, target_metric, target_value, target_sport, is_accumulative, reward_points, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+7 days'))`,
                            [userRow.id, "Log a single activity", "activity_count", 1, "Any", 0, 50, nowIso]
                        );
                    });
                }

                res.json({ success: true, message: `Set ${targetUsername} tier to ${tier}` });
            }
        );
    });
});

router.post("/api/admin/trigger-weekly-onboarding", authenticateToken, async (req, res) => {
  const { runWeeklyFeatureOnboardingJob } = require("../services/onboarding");
  console.log(`🤖 Admin triggering weekly onboarding job...`);
  try {
    await runWeeklyFeatureOnboardingJob();
    res.json({ success: true, message: "Weekly feature onboarding job triggered!" });
  } catch (e) {
    console.error("Admin trigger onboarding failed:", e);
    res.status(500).json({ error: "Failed to trigger onboarding job" });
  }
});

router.post("/api/admin/trigger-weekly-planning", authenticateToken, async (req, res) => {
  const { runWeeklyWorkoutPlanningJob } = require("../services/workoutPlanning");
  console.log(`🤖 Admin triggering weekly workout planning job (Common token budget)...`, req.body);
  try {
    const summary = await runWeeklyWorkoutPlanningJob(req.body || {});
    res.json({
      success: true,
      message: "Weekly workout planning job triggered successfully!",
      summary,
    });
  } catch (e) {
    console.error("Admin trigger weekly planning failed:", e);
    res.status(500).json({ error: "Failed to trigger weekly planning job" });
  }
});

router.post("/api/admin/repair-availability", authenticateToken, async (req, res) => {
  const { repairAvailabilityInMicroPlan } = require("../services/workoutPlanning");
  console.log(`🤖 Admin triggering availability repair on micro_plan...`, req.body);
  try {
    const result = await repairAvailabilityInMicroPlan(req.body.userId || null, req.body.fromDate || null);
    res.json({
      success: true,
      message: `Repaired ${result.repairedCount} rest day workout violation(s).`,
      ...result,
    });
  } catch (e) {
    console.error("Admin repair availability failed:", e);
    res.status(500).json({ error: "Failed to repair availability" });
  }
});

router.get("/api/admin/onboarding-status/:userId", authenticateToken, async (req, res) => {
  const { evaluateUserFeatureUsage, FEATURES_REGISTRY } = require("../services/onboarding");
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid userId" });

  await evaluateUserFeatureUsage(userId);

  db.all(
    `SELECT feature_key, status, introduced_at, first_used_at FROM user_feature_onboarding WHERE user_id = ?`,
    [userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Database error" });

      const statusMap = new Map();
      if (rows) {
        rows.forEach((r) => statusMap.set(r.feature_key, r));
      }

      const featureStatusList = FEATURES_REGISTRY.map((f) => {
        const record = statusMap.get(f.key);
        return {
          key: f.key,
          name: f.name,
          description: f.description,
          status: record ? record.status : "not_introduced",
          introduced_at: record ? record.introduced_at : null,
          first_used_at: record ? record.first_used_at : null
        };
      });

      res.json({ userId, features: featureStatusList });
    }
  );
});

/* ---------------------------------------------------------------------------
 * Discount codes
 *
 * The list is the admin's Discount page: every code with a live count of how
 * many athletes have redeemed it and how many hold it right now. Counts are
 * queried rather than kept in a column so they cannot drift out of step with
 * the ledger they are derived from.
 * ------------------------------------------------------------------------- */

const pricing = require("../services/pricing");

const DISCOUNT_LIST_QUERY = `
    SELECT c.*,
           (SELECT COUNT(*) FROM discount_redemptions r WHERE r.code_id = c.id) AS redemption_count,
           (SELECT COUNT(*) FROM user_discounts u WHERE u.code_id = c.id) AS active_holders
      FROM discount_codes c
     ORDER BY c.active DESC, c.created_at DESC
`;

function serializeDiscount(row) {
  const cap = pricing.redemptionCap(row);
  return {
    id: row.id,
    code: row.code,
    description: row.description || null,
    discountType: row.discount_type,
    percentOff: row.percent_off != null ? Number(row.percent_off) : null,
    fixedMonthlyPrice:
      row.fixed_monthly_price != null ? Number(row.fixed_monthly_price) : null,
    fixedYearlyPrice:
      row.fixed_yearly_price != null ? Number(row.fixed_yearly_price) : null,
    durationMonths: row.duration_months != null ? Number(row.duration_months) : null,
    redemptionType: row.redemption_type,
    maxRedemptions: row.max_redemptions != null ? Number(row.max_redemptions) : null,
    validFrom: row.valid_from || null,
    validUntil: row.valid_until || null,
    active: !!row.active,
    createdBy: row.created_by || null,
    createdAt: row.created_at || null,
    redemptionCount: row.redemption_count || 0,
    activeHolders: row.active_holders || 0,
    remainingUses: cap === Infinity ? null : Math.max(0, cap - (row.redemption_count || 0)),
    // What the two paywall boxes look like under this code, so the admin sees
    // the same numbers the athlete will.
    pricing: pricing.computePricing(row),
  };
}

router.get("/api/admin/discounts", authenticateToken, (req, res) => {
  db.all(DISCOUNT_LIST_QUERY, [], (err, rows) => {
    if (err) {
      console.error("Failed to list discount codes:", err.message);
      return res.status(500).json({ error: "Database error" });
    }
    res.json({
      basePricing: pricing.BASE_PRICING,
      codes: (rows || []).map(serializeDiscount),
    });
  });
});

function respondWithSingleDiscount(res, id, extra = {}) {
  db.get(
    `SELECT c.*,
            (SELECT COUNT(*) FROM discount_redemptions r WHERE r.code_id = c.id) AS redemption_count,
            (SELECT COUNT(*) FROM user_discounts u WHERE u.code_id = c.id) AS active_holders
       FROM discount_codes c WHERE c.id = ?`,
    [id],
    (err, row) => {
      if (err || !row) {
        return res.status(500).json({ error: "Failed to load saved code" });
      }
      res.json({ success: true, code: serializeDiscount(row), ...extra });
    },
  );
}

router.post("/api/admin/discounts", authenticateToken, (req, res) => {
  const parsed = pricing.validateCodeDefinition(req.body || {});
  if (parsed.errors) return res.status(400).json({ error: parsed.errors.join(" ") });
  const v = parsed.value;

  db.run(
    `INSERT INTO discount_codes
       (code, description, discount_type, percent_off, fixed_monthly_price, fixed_yearly_price,
        duration_months, redemption_type, max_redemptions, valid_from, valid_until, active, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      v.code, v.description, v.discountType, v.percentOff, v.fixedMonthlyPrice,
      v.fixedYearlyPrice, v.durationMonths, v.redemptionType, v.maxRedemptions,
      v.validFrom, v.validUntil, v.active, req.user.username,
    ],
    function (err) {
      if (err) {
        if (/UNIQUE/i.test(err.message)) {
          return res.status(409).json({ error: `Code ${v.code} already exists.` });
        }
        console.error("Failed to create discount code:", err.message);
        return res.status(500).json({ error: "Database error" });
      }
      db.run(
        `INSERT INTO audit_logs (admin_username, action, target_username, details) VALUES (?, 'discount_create', NULL, ?)`,
        [req.user.username, `Created code ${v.code} (${v.discountType})`],
      );
      respondWithSingleDiscount(res, this.lastID);
    },
  );
});

router.put("/api/admin/discounts/:id", authenticateToken, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const parsed = pricing.validateCodeDefinition(req.body || {});
  if (parsed.errors) return res.status(400).json({ error: parsed.errors.join(" ") });
  const v = parsed.value;

  db.run(
    `UPDATE discount_codes SET
        code = ?, description = ?, discount_type = ?, percent_off = ?,
        fixed_monthly_price = ?, fixed_yearly_price = ?, duration_months = ?,
        redemption_type = ?, max_redemptions = ?, valid_from = ?, valid_until = ?, active = ?
      WHERE id = ?`,
    [
      v.code, v.description, v.discountType, v.percentOff, v.fixedMonthlyPrice,
      v.fixedYearlyPrice, v.durationMonths, v.redemptionType, v.maxRedemptions,
      v.validFrom, v.validUntil, v.active, id,
    ],
    function (err) {
      if (err) {
        if (/UNIQUE/i.test(err.message)) {
          return res.status(409).json({ error: `Code ${v.code} already exists.` });
        }
        console.error("Failed to update discount code:", err.message);
        return res.status(500).json({ error: "Database error" });
      }
      if (this.changes === 0) return res.status(404).json({ error: "Code not found" });
      db.run(
        `INSERT INTO audit_logs (admin_username, action, target_username, details) VALUES (?, 'discount_update', NULL, ?)`,
        [req.user.username, `Updated code ${v.code}`],
      );
      respondWithSingleDiscount(res, id);
    },
  );
});

/**
 * Deleting a code that athletes are already on would leave user_discounts
 * pointing at nothing, so a redeemed code is deactivated instead — it stops
 * working for everyone, including its current holders, and stays visible in the
 * list. Only never-redeemed codes are actually removed.
 */
router.delete("/api/admin/discounts/:id", authenticateToken, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  db.get(
    `SELECT c.code,
            (SELECT COUNT(*) FROM discount_redemptions r WHERE r.code_id = c.id) AS redemption_count
       FROM discount_codes c WHERE c.id = ?`,
    [id],
    (err, row) => {
      if (err) return res.status(500).json({ error: "Database error" });
      if (!row) return res.status(404).json({ error: "Code not found" });

      const finish = (action, message) => {
        db.run(
          `INSERT INTO audit_logs (admin_username, action, target_username, details) VALUES (?, ?, NULL, ?)`,
          [req.user.username, action, `${message} (${row.code})`],
        );
        res.json({ success: true, deleted: action === "discount_delete", message });
      };

      if (row.redemption_count > 0) {
        return db.run(
          `UPDATE discount_codes SET active = 0 WHERE id = ?`,
          [id],
          (deactErr) => {
            if (deactErr) return res.status(500).json({ error: "Database error" });
            finish(
              "discount_deactivate",
              `Code has ${row.redemption_count} redemption(s) — deactivated instead of deleted`,
            );
          },
        );
      }

      db.run(`DELETE FROM discount_codes WHERE id = ?`, [id], (delErr) => {
        if (delErr) return res.status(500).json({ error: "Database error" });
        finish("discount_delete", "Code deleted");
      });
    },
  );
});

// Snapshot & Database Backup Endpoints
const backupService = require("../services/backup");

router.get("/api/admin/snapshots", authenticateToken, (req, res) => {
  try {
    const snapshots = backupService.listSnapshots();
    res.json({ snapshots });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/api/admin/snapshots", authenticateToken, async (req, res) => {
  const { tag } = req.body;
  try {
    const result = await backupService.createSnapshot(tag || "admin_manual");
    db.run(
      `INSERT INTO audit_logs (admin_username, action, target_username, details) VALUES (?, 'create_snapshot', NULL, ?)`,
      [req.user.username, `Created snapshot: ${result.filename}`]
    );
    res.json({ success: true, snapshot: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/api/admin/snapshots/restore", authenticateToken, async (req, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: "Missing filename parameter" });
  try {
    const result = await backupService.restoreSnapshot(filename);
    db.run(
      `INSERT INTO audit_logs (admin_username, action, target_username, details) VALUES (?, 'restore_snapshot', NULL, ?)`,
      [req.user.username, `Restored snapshot: ${filename}`]
    );
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Live coaching: paste a LiveTrack link for a user to test without email, watch running sessions.
router.get("/api/admin/live-sessions", async (req, res) => {
  try {
    res.json(await require("../services/liveSessionWorker").listLiveSessions());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/api/admin/live-sessions", async (req, res) => {
  const userId = Number(req.body && req.body.userId);
  if (!userId) return res.status(400).json({ error: "userId is required" });
  try {
    const row = await require("../services/liveSessionWorker").startLiveSession({ userId, url: req.body.url, source: "admin" });
    res.json({ id: row.id, status: row.status });
  } catch (e) {
    res.status(e.status || 502).json({ error: e.message });
  }
});

router.post("/api/admin/live-sessions/:id/stop", async (req, res) => {
  try {
    await require("../services/liveSessionWorker").stopLiveSession(Number(req.params.id));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/api/admin/live-coach/address/:userId", async (req, res) => {
  try {
    const address = await require("./liveCoach").getInboxAddress(Number(req.params.userId));
    if (!address) return res.status(404).json({ error: "User not found" });
    res.json({ address });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
