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

router.get("/api/my-profile", authenticateToken, async (req, res) => {
  try {
    const profileData = await generatePublicProfile(req.user.id, req.user.id);
    if (profileData) res.json(profileData);
    else res.status(404).json({ error: "Profile not found" });
  } catch (e) {
    console.error("Failed to generate profile for user", req.user.id, e);
    res.status(500).json({ error: "Failed to generate profile" });
  }
});

router.get("/api/social/profile/:id", authenticateToken, async (req, res) => {
  const targetUserId = req.params.id;
  try {
    const profileData = await generatePublicProfile(targetUserId, req.user.id);
    if (profileData) res.json(profileData);
    else res.status(404).json({ error: "User not found" });
  } catch (e) {
    console.error("Failed to generate profile for user", targetUserId, e);
    res.status(500).json({ error: "Failed to generate profile" });
  }
});

router.post("/api/social/search", authenticateToken, (req, res) => {
  const { username, query } = req.body;
  const searchTerm = (username || query || "").trim();
  if (!searchTerm) return res.json({ found: false, users: [] });

  db.all(
    `SELECT u.id, u.username, u.profile_picture_url, u.subscription_tier, u.role,
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
        subscription_tier: u.subscription_tier || 'free',
        role: u.role || 'user',
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
                badge: 1,
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

router.post(["/api/social/decline", "/api/social/reject"], authenticateToken, (req, res) => {
  const { friendId } = req.body;
  db.run(
    `UPDATE connections SET status = 'declined' WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`,
    [req.user.id, friendId, friendId, req.user.id],
    function (err) {
      // Update recipient's existing chat history payload for this friend request to 'declined'
      db.all(
        `SELECT id, payload_json FROM chat_history WHERE user_id = ? AND role = 'coach' AND payload_json LIKE '%connection_request%'`,
        [req.user.id],
        (err, rows) => {
          if (rows) {
            rows.forEach((row) => {
              try {
                const parsed = JSON.parse(row.payload_json);
                if (parsed && (parsed.friend_id == friendId || parsed.fromUserId == friendId)) {
                  parsed.status = "declined";
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
      res.json({ success: true });
    }
  );
});

router.get("/api/social/connections", authenticateToken, (req, res) => {
  db.all(
    `
        SELECT c.friend_id, c.status, u.username, u.profile_picture_url, u.subscription_tier, u.role
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
        LEFT JOIN activities a ON a.user_id = u.id AND a.start_date >= datetime('now', '-7 days') AND substr(a.start_date, 1, 10) >= substr(COALESCE(u.rooka_start_date, u.spark_start_date, u.created_at, date('now')), 1, 10)
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
              AND a.start_date >= datetime('now', '-7 days') AND substr(a.start_date, 1, 10) >= substr(COALESCE(u.rooka_start_date, u.spark_start_date, u.created_at, date('now')), 1, 10)
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
                        const prompt = `The athlete just received a Spark (a like/kudos) from their friend ${req.user.username || "Someone"} on their activity "${act.name}". Send a very short 1-sentence message to the athlete acknowledging this and hyping them up.`;
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
                                  title: "New Spark! ⚡",
                                  body: `${req.user.username || "A friend"} sent you a spark on ${act.name}!`,
                                  data: { url: "/(tabs)/social", type: "spark" },
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

router.post("/api/social/invite", authenticateToken, (req, res) => {
  const { micro_plan_id, invitee_ids, location, time } = req.body;
  if (!micro_plan_id || !invitee_ids || !Array.isArray(invitee_ids) || !invitee_ids.length) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Look up the micro_plan item
  db.get(
    `SELECT * FROM micro_plan WHERE id = ? AND user_id = ?`,
    [micro_plan_id, req.user.id],
    (err, plan) => {
      if (err || !plan) {
        console.error("Workout not found in DB for invite. ID:", micro_plan_id, "user:", req.user.id);
        return res.status(404).json({ error: "Workout not found" });
      }

      db.get(
        `SELECT username, profile_picture_url FROM users WHERE id = ?`,
        [req.user.id],
        (err, inviterUser) => {
          const inviterName = inviterUser?.username || req.user.username || "Friend";
          const inviterAvatar = inviterUser?.profile_picture_url || null;

          invitee_ids.forEach((inviteeId) => {
            db.run(
              `INSERT INTO event_invitations (inviter_id, invitee_id, micro_plan_id, location, time) VALUES (?, ?, ?, ?, ?)`,
              [req.user.id, inviteeId, micro_plan_id, location || '', time || ''],
              function (err) {
                if (err) {
                  console.error("Error creating event_invitations:", err);
                  return;
                }
                const inviteId = this.lastID;

                const payloadObj = {
                  type: 'event_invite',
                  invite_id: inviteId,
                  micro_plan_id: micro_plan_id,
                  sport: plan.sport,
                  date: plan.date,
                  description: plan.description || 'Workout',
                  inviter_name: inviterName,
                  inviter_avatar: inviterAvatar,
                  location: location || '',
                  time: time || '',
                  status: 'pending',
                };

                const locStr = location ? `\n📍 Location: ${location}` : '';
                const timeStr = time ? `\n🕒 Time: ${time}` : '';
                const inviteeMsg = `Hey! **${inviterName}** has invited you to join their upcoming **${plan.sport}** workout: **${plan.description || 'Workout'}**.\n\n📅 Date: ${plan.date}${locStr}${timeStr}\n\nDo you want to accept this invitation and add it to your plan?`;

                db.run(
                  `INSERT INTO chat_history (user_id, role, content, mood, payload_json) VALUES (?, 'coach', ?, 'support', ?)`,
                  [inviteeId, inviteeMsg, JSON.stringify(payloadObj)],
                  (err) => {
                    if (!err) {
                      sendSSEEvent(inviteeId, "unread_message", {
                        message: inviteeMsg,
                        mood: "support",
                        payload_json: payloadObj,
                      });
                      sendPushToUser(inviteeId, {
                        title: "Workout Invitation! 🏃",
                        body: `${inviterName} invited you to a ${plan.sport} workout on ${plan.date}!`,
                        data: { url: "/(tabs)/coach", type: "event_invite" },
                      });
                    }
                  }
                );
              }
            );
          });

          res.json({ success: true });
        }
      );
    }
  );
});

router.get("/api/social/invite/:plan_id", authenticateToken, (req, res) => {
  db.all(
    `SELECT invitee_id, status FROM event_invitations WHERE micro_plan_id = ? AND inviter_id = ?`,
    [req.params.plan_id, req.user.id],
    (err, invites) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ invites: invites || [] });
    }
  );
});

router.post("/api/social/invite/:id/accept", authenticateToken, (req, res) => {
  const inviteId = req.params.id;
  db.get(
    `SELECT * FROM event_invitations WHERE id = ? AND invitee_id = ?`,
    [inviteId, req.user.id],
    (err, invite) => {
      if (err || !invite) return res.status(404).json({ error: "Invite not found" });
      if (invite.status !== 'pending') return res.status(400).json({ error: "Invite already processed" });

      db.run(`UPDATE event_invitations SET status = 'accepted' WHERE id = ?`, [inviteId]);

      // Update invitee's chat history payload to 'accepted'
      db.all(
        `SELECT id, payload_json FROM chat_history WHERE user_id = ? AND role = 'coach' AND payload_json LIKE '%event_invite%'`,
        [req.user.id],
        (err, rows) => {
          if (rows) {
            rows.forEach((row) => {
              try {
                const parsed = JSON.parse(row.payload_json);
                if (parsed && (String(parsed.invite_id) === String(inviteId) || String(parsed.id) === String(inviteId))) {
                  parsed.status = 'accepted';
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

      // Copy workout to invitee's micro_plan
      db.get(`SELECT * FROM micro_plan WHERE id = ?`, [invite.micro_plan_id], (err, plan) => {
        if (plan) {
          db.run(
            `INSERT INTO micro_plan (user_id, date, sport, description, target_rooka, details, steps_json, source) VALUES (?, ?, ?, ?, ?, ?, ?, 'user')`,
            [
              req.user.id,
              plan.date,
              plan.sport,
              plan.description,
              plan.target_rooka || 0,
              plan.details || '',
              plan.steps_json || '[]',
            ],
            (err) => {
              if (!err) {
                sendSSEEvent(req.user.id, "plan_updated", {});
              }
            }
          );

          // Notify inviter
          db.get(`SELECT username FROM users WHERE id = ?`, [req.user.id], (err, acceptor) => {
            const acceptorName = acceptor ? acceptor.username : 'Someone';
            const inviterMsg = `${acceptorName} accepted your invitation for the ${plan.sport} workout on ${plan.date}!`;
            db.run(
              `INSERT INTO chat_history (user_id, role, content, mood) VALUES (?, 'coach', ?, 'hype')`,
              [invite.inviter_id, inviterMsg],
              () => {
                sendSSEEvent(invite.inviter_id, "unread_message", { message: inviterMsg, mood: "hype" });
                sendPushToUser(invite.inviter_id, {
                  title: "Invite Accepted! 🎉",
                  body: `${acceptorName} joined your ${plan.sport} workout on ${plan.date}!`,
                  data: { url: "/(tabs)/coach", type: "invite_accepted" },
                });
              }
            );
          });
        }
      });

      res.json({ success: true });
    }
  );
});

router.post("/api/social/invite/:id/decline", authenticateToken, (req, res) => {
  const inviteId = req.params.id;
  db.get(
    `SELECT * FROM event_invitations WHERE id = ? AND invitee_id = ?`,
    [inviteId, req.user.id],
    (err, invite) => {
      if (err || !invite) return res.status(404).json({ error: "Invite not found" });
      if (invite.status !== 'pending') return res.status(400).json({ error: "Invite already processed" });

      db.run(`UPDATE event_invitations SET status = 'declined' WHERE id = ?`, [inviteId]);

      // Update invitee's chat history payload to 'declined'
      db.all(
        `SELECT id, payload_json FROM chat_history WHERE user_id = ? AND role = 'coach' AND payload_json LIKE '%event_invite%'`,
        [req.user.id],
        (err, rows) => {
          if (rows) {
            rows.forEach((row) => {
              try {
                const parsed = JSON.parse(row.payload_json);
                if (parsed && (String(parsed.invite_id) === String(inviteId) || String(parsed.id) === String(inviteId))) {
                  parsed.status = 'declined';
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

      res.json({ success: true });
    }
  );
});

module.exports = router;
