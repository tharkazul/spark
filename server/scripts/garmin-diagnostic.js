const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
const db = require("../services/db");
const { decrypt, encrypt } = require("../services/crypto");
const { GarminConnect } = require("@flow-js/garmin-connect");

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

async function main() {
  console.log("==================================================");
  console.log("       Garmin Connect Diagnostic & Recovery       ");
  console.log("==================================================\n");

  const resolvedDbPath = process.env.DB_PATH 
    ? path.resolve(__dirname, "..", process.env.DB_PATH) 
    : path.join(__dirname, "..", "rooka_native.db");
  console.log(`📂 Database: ${resolvedDbPath}\n`);

  const args = process.argv.slice(2);
  const targetId = args.includes("--id") ? parseInt(args[args.indexOf("--id") + 1], 10) : 11;
  const importIdx = args.indexOf("--import");
  const generateIdx = args.indexOf("--generate-tokens");

  // Mode: Generate tokens locally on residential Mac IP
  if (generateIdx !== -1) {
    const user = await get(
      `SELECT id, username, garmin_username, garmin_password FROM users WHERE id = ?`,
      [targetId]
    );
    if (!user || !user.garmin_username || !user.garmin_password) {
      console.error(`❌ User ID ${targetId} has no Garmin credentials configured in this DB.`);
      process.exit(1);
    }
    const password = decrypt(user.garmin_password);
    console.log(`🔑 Logging into Garmin for "${user.garmin_username}" from this machine...`);
    const GCClient = new GarminConnect({
      username: user.garmin_username,
      password: password,
    });
    await GCClient.login(user.garmin_username, password);
    const tokens = GCClient.exportToken();
    const payload = Buffer.from(JSON.stringify(tokens)).toString("base64");
    console.log("\n🎉 Tokens successfully generated!");
    console.log("\nTo apply these tokens to your server, run this command on your server:");
    console.log(`\nnode server/scripts/garmin-diagnostic.js --id ${targetId} --import "${payload}"\n`);
    process.exit(0);
  }

  // Mode: Import tokens generated elsewhere
  if (importIdx !== -1) {
    const rawPayload = args[importIdx + 1];
    if (!rawPayload) {
      console.error("❌ No token payload provided after --import");
      process.exit(1);
    }
    try {
      const decoded = JSON.parse(Buffer.from(rawPayload, "base64").toString("utf8"));
      if (!decoded.oauth1 || !decoded.oauth2) {
        throw new Error("Invalid token format: missing oauth1 or oauth2");
      }
      const enc1 = encrypt(JSON.stringify(decoded.oauth1));
      const enc2 = encrypt(JSON.stringify(decoded.oauth2));
      await run(
        `UPDATE users SET garmin_oauth1_token = ?, garmin_oauth2_token = ? WHERE id = ?`,
        [enc1, enc2, targetId]
      );
      console.log(`✅ Successfully imported and encrypted Garmin OAuth tokens for user ${targetId}!`);
      console.log("Sync to Garmin will now work seamlessly without requiring full login.\n");
      process.exit(0);
    } catch (e) {
      console.error("❌ Failed to import tokens:", e.message);
      process.exit(1);
    }
  }

  // 1. Inspect all users with Garmin credentials
  const garminUsers = await all(
    `SELECT id, username, email, garmin_username, 
            garmin_password IS NOT NULL as has_password,
            garmin_oauth1_token IS NOT NULL as has_oauth1,
            garmin_oauth2_token IS NOT NULL as has_oauth2,
            garmin_oauth1_token, garmin_oauth2_token, garmin_password
     FROM users 
     WHERE garmin_username IS NOT NULL`
  );

  console.log(`🔍 Found ${garminUsers.length} user(s) with Garmin credentials configured:`);
  console.table(
    garminUsers.map((u) => ({
      ID: u.id,
      Username: u.username,
      GarminUsername: u.garmin_username,
      HasPassword: Boolean(u.has_password),
      HasOAuth1: Boolean(u.has_oauth1),
      HasOAuth2: Boolean(u.has_oauth2),
    }))
  );

  const targetUser = garminUsers.find((u) => u.id === targetId);
  if (!targetUser) {
    console.error(`❌ User with ID ${targetId} not found with Garmin username configured.`);
    process.exit(1);
  }

  console.log(`\n🎯 Target User: "${targetUser.username}" (ID: ${targetUser.id}, Garmin: ${targetUser.garmin_username})`);

  // Check if another account (e.g. user 1) has valid tokens for the SAME Garmin account
  const donorUser = garminUsers.find(
    (u) => u.id !== targetUser.id &&
           u.garmin_username === targetUser.garmin_username &&
           u.has_oauth1 && u.has_oauth2
  );

  if (donorUser && (!targetUser.has_oauth1 || !targetUser.has_oauth2)) {
    console.log(`\n💡 FOUND EXISTING TOKENS on donor account ID ${donorUser.id} ("${donorUser.username}")!`);
    console.log(`Copying OAuth tokens from User ${donorUser.id} to User ${targetUser.id}...`);
    await run(
      `UPDATE users SET garmin_oauth1_token = ?, garmin_oauth2_token = ? WHERE id = ?`,
      [donorUser.garmin_oauth1_token, donorUser.garmin_oauth2_token, targetUser.id]
    );
    targetUser.has_oauth1 = true;
    targetUser.has_oauth2 = true;
    targetUser.garmin_oauth1_token = donorUser.garmin_oauth1_token;
    targetUser.garmin_oauth2_token = donorUser.garmin_oauth2_token;
    console.log(`✅ Tokens copied to user ${targetUser.id}!`);
  }

  // 2. If target user has tokens, test validating/refreshing them
  if (targetUser.has_oauth1 && targetUser.has_oauth2) {
    console.log("\n🔑 Testing existing OAuth tokens in DB...");
    try {
      const oauth1 = JSON.parse(decrypt(targetUser.garmin_oauth1_token));
      const oauth2 = JSON.parse(decrypt(targetUser.garmin_oauth2_token));

      const decryptedPassword = decrypt(targetUser.garmin_password);
      const GCClient = new GarminConnect({
        username: targetUser.garmin_username,
        password: decryptedPassword,
      });

      GCClient.loadToken(oauth1, oauth2);

      console.log("   Calling GCClient.client.checkTokenVaild()...");
      await GCClient.client.checkTokenVaild();

      console.log("   Testing lightweight API call (getUserProfile)...");
      const profile = await GCClient.getUserProfile();
      console.log(`   ✅ SUCCESS! Profile retrieved: "${profile?.displayName || profile?.userName || 'OK'}"`);

      // Save refreshed tokens if updated
      const updatedTokens = GCClient.exportToken();
      if (updatedTokens?.oauth1 && updatedTokens?.oauth2) {
        const enc1 = encrypt(JSON.stringify(updatedTokens.oauth1));
        const enc2 = encrypt(JSON.stringify(updatedTokens.oauth2));
        await run(
          `UPDATE users SET garmin_oauth1_token = ?, garmin_oauth2_token = ? WHERE id = ?`,
          [enc1, enc2, targetUser.id]
        );
        console.log("   💾 Updated refreshed tokens saved to database.");
      }

      console.log("\n🎉 Garmin Connect is FULLY OPERATIONAL via OAuth tokens! Sync will now work without login.\n");
      process.exit(0);
    } catch (tokenErr) {
      console.warn("   ⚠️ Existing OAuth token validation failed:", tokenErr.message);
      console.log("   Proceeding to diagnostic test on full login...");
    }
  }

  // 3. Perform diagnostic login test to inspect exact Garmin 429 response
  console.log("\n🧪 Performing diagnostic full login test...");
  const password = decrypt(targetUser.garmin_password);
  if (!password) {
    console.error("❌ Could not decrypt Garmin password for user.");
    process.exit(1);
  }

  const GCClient = new GarminConnect({
    username: targetUser.garmin_username,
    password: password,
  });

  // Attach interceptors to capture exact request/response
  const axiosClient = GCClient.client.client;
  if (axiosClient && axiosClient.interceptors) {
    axiosClient.interceptors.request.use((config) => {
      console.log(`   ➡️  [HTTP ${config.method ? config.method.toUpperCase() : 'GET'}] ${config.url}`);
      return config;
    });

    axiosClient.interceptors.response.use(
      (res) => {
        console.log(`   ✅ [HTTP ${res.status}] ${res.config.url}`);
        return res;
      },
      (err) => {
        const status = err.response ? err.response.status : 'NO_STATUS';
        const url = err.config ? err.config.url : 'UNKNOWN_URL';
        console.log(`   ❌ [HTTP ${status}] ${url}`);
        if (err.response) {
          console.log(`      Response Headers:`, JSON.stringify(err.response.headers, null, 2));
          console.log(`      Response Data:`, typeof err.response.data === 'object' ? JSON.stringify(err.response.data, null, 2) : err.response.data);
          if (err.response.headers && err.response.headers['retry-after']) {
            console.log(`      ⏱️ Retry-After: ${err.response.headers['retry-after']} seconds`);
          }
        }
        return Promise.reject(err);
      }
    );
  }

  try {
    await GCClient.login(targetUser.garmin_username, password);
    console.log("\n🎉 Login succeeded! Exporting and saving OAuth tokens to DB...");
    const tokens = GCClient.exportToken();
    if (tokens?.oauth1 && tokens?.oauth2) {
      const enc1 = encrypt(JSON.stringify(tokens.oauth1));
      const enc2 = encrypt(JSON.stringify(tokens.oauth2));
      await run(
        `UPDATE users SET garmin_oauth1_token = ?, garmin_oauth2_token = ? WHERE id = ?`,
        [enc1, enc2, targetUser.id]
      );
      console.log("💾 OAuth tokens successfully saved to DB! Full login will be bypassed next time.\n");
    }
  } catch (loginErr) {
    console.log("\n==================================================");
    console.log("          GARMIN 429 DIAGNOSTIC RESULT            ");
    console.log("==================================================");
    console.log(`Result: ${loginErr.message}`);
    console.log("\nExplanation:");
    console.log("Garmin's Cloudflare SSO service temporarily blocks fresh credential logins from datacenter server IPs.");
    console.log("==================================================\n");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
