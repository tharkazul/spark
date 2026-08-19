const express = require('express');
const router = express.Router();
const db = require('../services/db');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { authenticateToken } = require('../services/auth');
const { sseClients, sendSSEEvent } = require('../services/sse');
const { generateWithFallback } = require('../services/ai');
const { encrypt, decrypt } = require('../services/crypto');
const { sendPushToUser } = require('../services/pushNotificationService');
const {
  matchGarminExercise,
  getAMSDateString,
  getAMSWeekday,
  getUserGamificationContext,
  getUserLeaderboardString,
  getWeatherContext,
  getUserMacroPhase,
  generatePublicProfile,
  calculateGlobalMaxStats,
  generateAllPublicProfiles,
  processTokenRefresh,
  getStravaTokenForUser,
  getRookaLevelInfo,
  calculateRookaScore,
  mapStravaSportToRooka,
  formatStepsForStrava,
  tagStravaActivity,
  getStravaActivity,
  syncAllStravaUsersOnStartup,
  triggerBackgroundSummary,
  updateUserRookaAndCheckLevel,
  triggerLevelUpCoachPrompt,
  generateQuestForUser,
  evaluateQuestsAgainstActivity,
  evaluateAndProgressQuests
} = require('../services/utils');

router.get("/api/my-profile", authenticateToken, (req, res) => {
  db.get(
    "SELECT data FROM public_profile_cache WHERE user_id = ?",
    [req.user.id],
    async (err, row) => {
      if (row && row.data) {
        return res.json(JSON.parse(row.data));
      } else {
        try {
          const globalMaxStats = await calculateGlobalMaxStats();
          const profileData = await generatePublicProfile(
            req.user.id,
            globalMaxStats,
          );
          if (profileData) res.json(profileData);
          else res.status(404).json({ error: "Profile not generated yet" });
        } catch (e) {
          console.error("Failed to generate profile for user", req.user.id, e);
          res.status(500).json({ error: "Failed to generate profile" });
        }
      }
    },
  );
});

router.get("/api/social/profile/:id", authenticateToken, (req, res) => {
  const targetUserId = req.params.id;

  db.get(
    `SELECT data FROM public_profile_cache WHERE user_id = ?`,
    [targetUserId],
    async (err, row) => {
      if (row && row.data) {
        return res.json(JSON.parse(row.data));
      } else {
        // Fallback generation if missing
        const globalMaxStats = await calculateGlobalMaxStats();
        const profileData = await generatePublicProfile(
          targetUserId,
          globalMaxStats,
        );
        if (profileData) res.json(profileData);
        else res.status(404).json({ error: "User not found" });
      }
    },
  );
});

router.post("/api/social/search", authenticateToken, (req, res) => {
  const { username, query } = req.body;
  const searchTerm = (username || query || "").trim();
  if (!searchTerm) return res.json({ found: false, users: [] });

  db.all(
    `SELECT u.id, u.username, u.profile_picture_url,
            (SELECT status FROM connections WHERE user_id = ? AND friend_id = u.id) as status
     FROM users u
     WHERE LOWER(u.username) LIKE LOWER(?) 
       AND (u.search_privacy = 0 OR u.search_privacy IS NULL)
       AND u.deleted_at IS NULL
     ORDER BY u.username ASC
     LIMIT 10`,
    [req.user.id, `%${searchTerm}%`],
    (err, rows) => {
      if (err || !rows || rows.length === 0) {
        return res.json({ found: false, users: [], user: null });
      }
      const mapped = rows.map((u) => ({
        id: u.id,
        username: u.username,
        profile_picture_url: u.profile_picture_url,
        status: u.id === req.user.id ? 'self' : (u.status || null),
      }));
      res.json({
        found: true,
        users: mapped,
        user: mapped[0],
      });
    },
  );
});

router.post("/api/social/connect", authenticateToken, (req, res) => {
  const { friendId } = req.body;
  db.run(
    `INSERT OR IGNORE INTO connections (user_id, friend_id, status) VALUES (?, ?, 'pending')`,
    [req.user.id, friendId],
    function (err) {
      db.run(
        `INSERT OR IGNORE INTO connections (user_id, friend_id, status) VALUES (?, ?, 'pending_received')`,
        [friendId, req.user.id],
        function (err2) {
          sendSSEEvent(friendId, "connection_request", {
            fromUserId: req.user.id,
            username: req.user.username,
          });

          // Insert chat notification message for recipient (friendId) with interactive payload
          const payloadObj = {
            type: "connection_request",
            friend_id: req.user.id,
            username: req.user.username,
            status: "pending",
          };
          const payloadJson = JSON.stringify(payloadObj);
          const chatMsg = `${req.user.username} wants to connect with you on Rooka! Do you want to accept their connection request?`;

          db.run(
            `INSERT INTO chat_history (user_id, role, content, mood, payload_json) VALUES (?, 'coach', ?, 'support', ?)`,
            [friendId, chatMsg, payloadJson],
            (chatErr) => {
              sendSSEEvent(friendId, "unread_message", {
                message: chatMsg,
                mood: "support",
                payload_json: payloadObj,
              });
              sendPushToUser(friendId, {
                title: "New Connection Request! 🏃",
                body: `${req.user.username} sent you a connection request on Rooka.`,
                data: { url: "/(tabs)/coach", type: "connection" },
              });
            }
          );

          res.json({ success: true });
        },
      );
    },
  );
});

router.post("/api/social/accept", authenticateToken, (req, res) => {
  const { friendId } = req.body;
  db.run(
    `UPDATE connections SET status = 'accepted' WHERE user_id = ? AND friend_id = ?`,
    [req.user.id, friendId],
    function (err) {
      db.run(
        `UPDATE connections SET status = 'accepted' WHERE user_id = ? AND friend_id = ?`,
        [friendId, req.user.id],
        function (err2) {
          sendSSEEvent(friendId, "connection_accepted", {
            fromUserId: req.user.id,
            username: req.user.username,
          });
          sendPushToUser(friendId, {
            title: "Connection Accepted! 🤝",
            body: `${req.user.username} accepted your connection request!`,
            data: { url: "/(tabs)/social", type: "connection" },
          });

          // Update recipient's existing chat history payload for this friend request to 'accepted'
          db.all(
            `SELECT id, payload_json FROM chat_history WHERE user_id = ? AND role = 'coach' AND payload_json LIKE '%connection_request%'`,
            [req.user.id],
            (err, rows) => {
              if (rows) {
                rows.forEach((row) => {
                  try {
                    const parsed = JSON.parse(row.payload_json);
                    if (parsed && (parsed.friend_id == friendId || parsed.fromUserId == friendId)) {
                      parsed.status = "accepted";
                      db.run(
                        `UPDATE chat_history SET payload_json = ? WHERE id = ?`,
                        [JSON.stringify(parsed), row.id]
                      );
                    }
                  } catch (e) {}
                });
              }
            }
          );

          // Send Coach confirmation message to the original requester (friendId)
          db.get(
            `SELECT coach_tone FROM users WHERE id = ?`,
            [friendId],
            async (err, friendUser) => {
              const confirmPayloadObj = {
                type: "connection_accepted",
                friend_id: req.user.id,
                username: req.user.username,
              };
              const confirmPayload = JSON.stringify(confirmPayloadObj);
              let confirmMsg = `${req.user.username} accepted your connection request! You are now connected on Rooka!`;

              if (friendUser) {
                const prompt = `The athlete just connected with their friend ${req.user.username} on the app. Send a short 1-2 sentence message to the athlete welcoming the new connection and telling them to use the friendly competition as motivation!`;
                const sysPrompt = `You are an elite endurance coach. Your tone is: ${friendUser.coach_tone || "Friendly and motivating"}.`;
                try {
                  const aiMsg = await generateWithFallback(prompt, sysPrompt);
                  if (aiMsg) confirmMsg = aiMsg;
                } catch (e) {
                  console.error(e);
                }
              }

              db.run(
                `INSERT INTO chat_history (user_id, role, content, mood, payload_json) VALUES (?, 'coach', ?, 'hype', ?)`,
                [friendId, confirmMsg, confirmPayload],
                (err) => {
                  sendSSEEvent(friendId, "unread_message", {
                    message: confirmMsg,
                    mood: "hype",
                    payload_json: confirmPayloadObj,
                  });
                }
              );
            },
          );

          res.json({ success: true });
        },
      );
    },
  );
});

router.get("/api/social/connections", authenticateToken, (req, res) => {
  db.all(
    `
        SELECT c.friend_id, c.status, u.username
        FROM connections c
        JOIN users u ON c.friend_id = u.id
        WHERE c.user_id = ?
    `,
    [req.user.id],
    (err, rows) => {
      res.json({ connections: rows || [] });
    },
  );
});

router.get("/api/social/feed", authenticateToken, (req, res) => {
  db.all(
    `
        SELECT a.*, u.username, u.profile_picture_url, u.total_rooka,
               (SELECT COUNT(*) FROM kudos k WHERE k.activity_id = a.id) as kudos_count,
               (SELECT COUNT(*) FROM kudos k WHERE k.activity_id = a.id AND k.user_id = ?) as has_kudosed,
               (SELECT COUNT(*) FROM activity_comments c WHERE c.activity_id = a.id) as comment_count
        FROM activities a
        JOIN users u ON a.user_id = u.id
        WHERE a.user_id = ? OR a.user_id IN (SELECT friend_id FROM connections WHERE user_id = ? AND status = 'accepted')
        ORDER BY a.start_date DESC
        LIMIT 20
    `,
    [req.user.id, req.user.id, req.user.id],
    (err, rows) => {
      if (rows) {
        rows.forEach((r) => {
          r.rooka_level = getRookaLevelInfo(r.total_rooka).level;
          if (typeof r.rooka_score === "number") {
            r.rooka_score = Math.round(r.rooka_score);
          }
        });
      }
      res.json({ activities: rows || [] });
    },
  );
});

router.get("/api/social/leaderboard", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Evaluate active quests for the current user and their friends before generating leaderboard
    try {
      const friends = await new Promise((resolve) => {
        db.all(
          `SELECT friend_id FROM connections WHERE user_id = ? AND status = 'accepted'`,
          [userId],
          (err, rows) => resolve(rows || []),
        );
      });
      const userIdsToEvaluate = [userId, ...friends.map((f) => f.friend_id)];
      await Promise.all(userIdsToEvaluate.map((id) => evaluateAndProgressQuests(id)));
    } catch (e) {
      console.error("Error evaluating leaderboard user quests:", e);
    }

    const mainLeaderboard = await new Promise((resolve, reject) => {
      db.all(
        `
        SELECT u.id, u.username, u.profile_picture_url, u.total_rooka, 
               (COALESCE(SUM(a.rooka_score), 0) + COALESCE((SELECT SUM(amount) FROM bonus_points WHERE user_id = u.id AND created_at >= datetime('now', '-7 days')), 0)) as total_rooka_score, 
               SUM(a.moving_time_min) as total_minutes, COUNT(a.id) as total_activities,
               COALESCE((SELECT COUNT(*) FROM user_quests WHERE user_id = u.id AND status = 'completed' AND (completed_at >= datetime('now', '-7 days') OR (completed_at IS NULL AND created_at >= datetime('now', '-7 days')))), 0) as quests_completed_7d,
               COALESCE((SELECT SUM(amount) FROM bonus_points WHERE user_id = u.id AND reason LIKE 'Quest Completed%' AND created_at >= datetime('now', '-7 days')), (SELECT SUM(reward_points) FROM user_quests WHERE user_id = u.id AND status = 'completed' AND (completed_at >= datetime('now', '-7 days') OR (completed_at IS NULL AND created_at >= datetime('now', '-7 days')))), 0) as quest_rooka_7d
        FROM users u
        LEFT JOIN activities a ON a.user_id = u.id AND a.start_date >= datetime('now', '-7 days') AND (u.rooka_start_date IS NULL OR substr(a.start_date, 1, 10) >= substr(u.rooka_start_date, 1, 10))
        WHERE (u.id = ? OR u.id IN (SELECT friend_id FROM connections WHERE user_id = ? AND status = 'accepted'))
          AND u.deleted_at IS NULL
        GROUP BY u.id
        ORDER BY total_rooka_score DESC
    `,
        [userId, userId],
        (err, rows) => {
          if (err) return reject(err);
          if (rows) {
            rows.forEach((r) => {
              r.rooka_level = getRookaLevelInfo(r.total_rooka).level;
              if (typeof r.total_rooka_score === "number") {
                r.total_rooka_score = Math.round(r.total_rooka_score);
              }
            });
          }
          resolve(rows || []);
        },
      );
    });

    const completedQuests = await new Promise((resolve) => {
      db.all(
        `
            SELECT id, user_id, description, reward_points, completed_at, created_at
            FROM user_quests
            WHERE status = 'completed'
              AND (completed_at >= datetime('now', '-7 days') OR (completed_at IS NULL AND created_at >= datetime('now', '-7 days')))
              AND (user_id = ? OR user_id IN (SELECT friend_id FROM connections WHERE user_id = ? AND status = 'accepted'))
        `,
        [userId, userId],
        (err, rows) => {
          if (err) return resolve([]);
          resolve(rows || []);
        },
      );
    });

    const questLeaderboard = mainLeaderboard.map((user) => {
      const userQuests = completedQuests.filter((q) => q.user_id === user.id);
      const total_quest_rooka = userQuests.reduce((sum, q) => sum + (q.reward_points || 0), 0);
      return {
        id: user.id,
        username: user.username,
        profile_picture_url: user.profile_picture_url,
        rooka_level: user.rooka_level,
        quests_completed_7d: userQuests.length,
        completed_quests_count: userQuests.length,
        total_quest_rooka: Math.round(total_quest_rooka),
        quests: userQuests.map((q) => ({ description: q.description, points: Math.round(q.reward_points || 0) })),
      };
    });

    questLeaderboard.sort((a, b) => {
      if (b.completed_quests_count !== a.completed_quests_count) {
        return b.completed_quests_count - a.completed_quests_count;
      }
      if (b.total_quest_rooka !== a.total_quest_rooka) {
        return b.total_quest_rooka - a.total_quest_rooka;
      }
      return a.username.localeCompare(b.username);
    });

    const topActivities = await new Promise((resolve) => {
      db.all(
        `
            SELECT a.id, a.user_id, a.name, a.sport_type, a.distance_km, a.moving_time_min, a.rooka_score, a.start_date,
                   u.username, u.profile_picture_url, u.total_rooka
            FROM activities a
            JOIN users u ON a.user_id = u.id
            WHERE (u.id = ? OR u.id IN (SELECT friend_id FROM connections WHERE user_id = ? AND status = 'accepted'))
              AND a.start_date >= datetime('now', '-7 days') AND (u.rooka_start_date IS NULL OR substr(a.start_date, 1, 10) >= substr(u.rooka_start_date, 1, 10))
            ORDER BY a.rooka_score DESC, a.start_date DESC
            LIMIT 3
        `,
        [userId, userId],
        (err, rows) => {
          if (err) return resolve([]);
          if (rows) {
            rows.forEach((r) => {
              r.rooka_level = getRookaLevelInfo(r.total_rooka).level;
              if (typeof r.rooka_score === "number") {
                r.rooka_score = Math.round(r.rooka_score);
              }
            });
          }
          resolve(rows || []);
        },
      );
    });

    res.json({
      leaderboard: mainLeaderboard,
      questLeaderboard,
      topActivities,
    });
  } catch (e) {
    console.error("Error loading full leaderboard data:", e);
    res.status(500).json({ error: "Failed to load leaderboard data." });
  }
});

router.post("/api/social/kudos", authenticateToken, (req, res) => {
  const { activityId } = req.body;
  db.get(
    `SELECT user_id FROM kudos WHERE activity_id = ? AND user_id = ?`,
    [activityId, req.user.id],
    (err, row) => {
      if (row) {
        db.run(
          `DELETE FROM kudos WHERE activity_id = ? AND user_id = ?`,
          [activityId, req.user.id],
          () => res.json({ success: true, added: false }),
        );
      } else {
        db.run(
          `INSERT INTO kudos (activity_id, user_id) VALUES (?, ?)`,
          [activityId, req.user.id],
          () => {
            db.get(
              `SELECT user_id, name FROM activities WHERE id = ?`,
              [activityId],
              (err, act) => {
                if (act && act.user_id !== req.user.id) {
                  sendSSEEvent(act.user_id, "kudos_received", {
                    activityName: act.name,
                    fromUsername: req.user.username || "Someone",
                  });

                  db.get(
                    `SELECT coach_tone FROM users WHERE id = ?`,
                    [act.user_id],
                    async (err, coachUser) => {
                      if (coachUser) {
                        const prompt = `The athlete just received Kudos (a like) from their friend ${req.user.username || "Someone"} on their activity "${act.name}". Send a very short 1-sentence message to the athlete acknowledging this and hyping them up.`;
                        const sysPrompt = `You are an elite endurance coach. Your tone is: ${coachUser.coach_tone || "Friendly and motivating"}.`;
                        try {
                          const msg = await generateWithFallback(
                            prompt,
                            sysPrompt,
                          );
                          db.run(
                            `INSERT INTO chat_history (user_id, role, content, mood) VALUES (?, 'coach', ?, 'hype')`,
                            [act.user_id, msg],
                            (err) => {
                              if (!err) {
                                sendSSEEvent(act.user_id, "unread_message", {
                                  message: msg,
                                  mood: "hype",
                                });
                                sendPushToUser(act.user_id, {
                                  title: "New Kudos! ⚡",
                                  body: `${req.user.username || "A friend"} gave you kudos on ${act.name}!`,
                                  data: { url: "/(tabs)/social", type: "kudos" },
                                });
                              }
                            }
                          );
                        } catch (e) {
                          console.error(e);
                        }
                      }
                    },
                  );
                }
              },
            );
            res.json({ success: true, added: true });
          },
        );
      }
    },
  );
});

module.exports = router;
