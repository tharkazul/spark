const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");

const dbFile = path.join(os.tmpdir(), `rooka_test_chat_bg_${process.pid}.db`);
process.env.DB_PATH = dbFile;

// Mock Push Notification service
const pushedNotifications = [];
const pushPath = require.resolve("./services/pushNotificationService");
const pushMock = new Module(pushPath);
pushMock.filename = pushPath;
pushMock.loaded = true;
pushMock.exports = {
  sendPushToUser: async (userId, payload) => {
    pushedNotifications.push({ userId, payload });
    return { status: "ok" };
  },
  sendExpoPushNotification: async () => ({ status: "ok" }),
};
require.cache[pushPath] = pushMock;

// Mock SSE service
const sseEvents = [];
const ssePath = require.resolve("./services/sse");
const sseMock = new Module(ssePath);
sseMock.filename = ssePath;
sseMock.loaded = true;
sseMock.exports = {
  sendSSEEvent: (userId, event, data) => {
    sseEvents.push({ userId, event, data });
  },
  sseClients: new Map(),
};
require.cache[ssePath] = sseMock;

// Mock AI service
let aiResponseDelay = 50;
const aiPath = require.resolve("./services/ai");
const aiMock = new Module(aiPath);
aiMock.filename = aiPath;
aiMock.loaded = true;
aiMock.exports = {
  generateWithFallback: async (prompt, systemPrompt) => {
    if (aiResponseDelay > 0) {
      await new Promise((r) => setTimeout(r, aiResponseDelay));
    }
    return "Great job today! Rest up tonight.";
  },
  generateImage: async () => null,
  transcribeAudio: async () => "Transcribed test audio note.",
};
require.cache[aiPath] = aiMock;

// Mock Auth service
const authPath = require.resolve("./services/auth");
const authMock = new Module(authPath);
authMock.filename = authPath;
authMock.loaded = true;
authMock.exports = {
  authenticateToken: (req, res, next) => {
    req.user = { id: 1, role: "user" };
    next();
  },
};
require.cache[authPath] = authMock;

const db = require("./services/db");
const express = require("express");
const http = require("http");

const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, (e) => (e ? rej(e) : res())));
const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  try {
    await sleep(1500); // Wait for schema initialization

    // Seed test user
    await run(`INSERT INTO users (id, username, language, coach_name, coach_tone, subscription_tier, ai_consent) VALUES (1, 'runner', 'en', 'Coach Alex', 'hype', 'rooka_plus', 1)`);

    const chatRouter = require("./routes/chat");
    const app = express();
    app.use(express.json());
    app.use(chatRouter);

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    console.log("🧪 Test 1: Immediate user message persistence & push notification on completion");
    
    // Normal request
    const resp1 = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Should I do 5k tomorrow?" }),
    });
    assert.strictEqual(resp1.status, 200);
    const body1 = await resp1.json();
    assert(body1.reply.includes("Great job today!"), "Expected coach reply in response body");

    // Verify chat_history
    const history = await all(`SELECT role, content FROM chat_history WHERE user_id = 1 ORDER BY id ASC`);
    assert.strictEqual(history.length, 2, "Expected 2 messages in chat_history (1 user, 1 coach)");
    assert.strictEqual(history[0].role, "user");
    assert.strictEqual(history[0].content, "Should I do 5k tomorrow?");
    assert.strictEqual(history[1].role, "coach");
    assert.strictEqual(history[1].content, "Great job today! Rest up tonight.");

    // Verify push notification
    assert.strictEqual(pushedNotifications.length, 1, "Expected 1 push notification dispatched");
    assert.strictEqual(pushedNotifications[0].userId, 1);
    assert.strictEqual(pushedNotifications[0].payload.title, "Benjamin");
    assert(pushedNotifications[0].payload.body.includes("Great job today!"), "Push body should match reply");

    // Verify SSE
    const unreadSse = sseEvents.find(e => e.event === "unread_message");
    assert(unreadSse, "Expected unread_message SSE event");
    assert.strictEqual(unreadSse.userId, 1);

    console.log("✅ Test 1 Passed: User message persisted immediately, coach reply saved, push notification & SSE dispatched.");

    console.log("🧪 Test 2: In-flight user message persistence when client disconnects during generation");

    aiResponseDelay = 300; // Delay AI by 300ms so we can check DB mid-flight
    pushedNotifications.length = 0;

    // Start request asynchronously
    const sendPromise = fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Will it rain during my ride?" }),
    });

    // Wait 80ms (after route entry and immediate insert, but BEFORE 300ms AI finishes)
    await sleep(80);

    // Check if the user message is ALREADY in the database while AI is still generating
    const midFlightHistory = await all(`SELECT role, content FROM chat_history WHERE user_id = 1 ORDER BY id DESC LIMIT 2`);
    assert.strictEqual(midFlightHistory[0].role, "user", "User message must be persisted immediately before AI finishes");
    assert.strictEqual(midFlightHistory[0].content, "Will it rain during my ride?");

    console.log("✅ User message is stored in DB while LLM is still in-flight!");

    // Await completion of generation
    const resp2 = await sendPromise;
    assert.strictEqual(resp2.status, 200);

    // Check that coach reply was also persisted
    const completedHistory = await all(`SELECT role, content FROM chat_history WHERE user_id = 1 ORDER BY id DESC LIMIT 2`);
    assert.strictEqual(completedHistory[0].role, "coach");
    assert.strictEqual(completedHistory[1].role, "user");
    assert.strictEqual(pushedNotifications.length, 1, "Push notification sent upon completion");

    server.close();

    console.log("✅ Test 2 Passed: User message is safe even before LLM finishes, and coach reply is saved and pushed.");

    console.log("🎉 All background chat persistence & push tests passed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Test failed:", err);
    process.exit(1);
  } finally {
    try {
      if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
    } catch (_) {}
  }
})();
