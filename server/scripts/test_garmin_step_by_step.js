require('dotenv').config();
const path = require('path');
const { GarminConnect } = require('@flow-js/garmin-connect');
const db = require('../services/db');
const { decrypt } = require('../services/crypto');

async function runTest() {
  console.log('==========================================');
  console.log(' Garmin Step-by-Step Diagnostic Test');
  console.log('==========================================\n');

  // 1. Fetch user credentials
  const user = await new Promise((resolve, reject) => {
    db.get('SELECT id, username, garmin_username, garmin_password FROM users WHERE garmin_username IS NOT NULL LIMIT 1', (err, row) => {
      if (err || !row) reject(err || new Error('No user with Garmin credentials found'));
      else resolve(row);
    });
  });

  console.log(`[Step 1] Loaded user: "${user.username}" (ID: ${user.id})`);
  console.log(`         Garmin Username: "${user.garmin_username}"`);

  // 2. Decrypt password
  const password = decrypt(user.garmin_password);
  if (!password) {
    console.error('❌ Failed to decrypt password!');
    process.exit(1);
  }
  console.log(`[Step 2] Password decrypted successfully (length: ${password.length} chars, starts with: ${password.slice(0, 2)}***)`);

  // 3. Create GarminConnect client
  const GCClient = new GarminConnect({
    username: user.garmin_username,
    password: password,
  });

  // Intercept all Axios requests & responses from the underlying HttpClient
  const axiosClient = GCClient.client.client;
  if (axiosClient && axiosClient.interceptors) {
    axiosClient.interceptors.request.use((config) => {
      console.log(`\n  ➡️  [HTTP ${config.method ? config.method.toUpperCase() : 'GET'}] ${config.url}`);
      return config;
    });

    axiosClient.interceptors.response.use(
      (response) => {
        console.log(`  ✅ [HTTP ${response.status}] ${response.config.url}`);
        return response;
      },
      (error) => {
        const status = error.response ? error.response.status : 'NO_STATUS';
        const url = error.config ? error.config.url : 'UNKNOWN_URL';
        console.log(`  ❌ [HTTP ${status}] ${url}`);
        if (error.response) {
          console.log(`     Headers:`, JSON.stringify(error.response.headers, null, 2));
          console.log(`     Data:`, typeof error.response.data === 'object' ? JSON.stringify(error.response.data, null, 2) : error.response.data);
        }
        return Promise.reject(error);
      }
    );
  }

  // 4. Attempt login
  console.log(`\n[Step 3] Calling GCClient.login("${user.garmin_username}", "...")`);
  try {
    await GCClient.login(user.garmin_username, password);
    console.log('\n🎉 SUCCESS! GCClient.login() completed successfully!');

    // 5. Test exporting tokens
    const tokens = GCClient.exportToken();
    console.log('\n[Step 4] Exported Tokens:');
    console.log('         OAuth1 token key:', tokens?.oauth1?.oauth_token ? 'Present' : 'Missing');
    console.log('         OAuth2 access token:', tokens?.oauth2?.access_token ? tokens.oauth2.access_token.slice(0, 15) + '...' : 'Missing');
    console.log('         OAuth2 expires in:', tokens?.oauth2?.expires_in, 'seconds');

    // 6. Test making a light API call
    console.log('\n[Step 5] Testing lightweight API call: getUserProfile()...');
    const profile = await GCClient.getUserProfile();
    console.log(`  ✅ Profile retrieved! Display name: "${profile?.displayName || profile?.userName || 'N/A'}"`);

    console.log('\n==========================================');
    console.log(' DIAGNOSTIC RESULT: Garmin Connect login is WORKING!');
    console.log('==========================================');
  } catch (err) {
    console.log('\n==========================================');
    console.log(' DIAGNOSTIC RESULT: Login failed.');
    console.log(` Error message: ${err.message}`);
    if (err.response) {
      console.log(` HTTP Status: ${err.response.status}`);
      console.log(` Status Text: ${err.response.statusText}`);
      console.log(` Response Data:`, err.response.data);
    }
    console.log('==========================================');
  }

  process.exit(0);
}

runTest().catch((err) => {
  console.error('Fatal script error:', err);
  process.exit(1);
});
