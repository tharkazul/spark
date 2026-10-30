/**
 * Garmin Connect Developer Program (official API, Starter access): the OAuth 2.0
 * PKCE connection, its tokens, and the user-level calls (user id, permissions,
 * deregistration). Activity and health data arrive later by push webhooks; this
 * module only owns the connection.
 *
 * Connect flow: the app asks /api/garmin/connect for the authorize URL. The server
 * makes a PKCE verifier, keeps it (encrypted) in garmin_oauth_pending under a
 * random state, and sends the athlete to Garmin's consent page. Garmin sends the
 * browser to /garminredirect with ?code&state, and the server swaps the code for
 * tokens with the verifier and the client secret. Garmin has no public-client
 * flow, so the exchange and every refresh must stay on the server.
 *
 * Required env (server/.env):
 *   GARMIN_CLIENT_ID, GARMIN_CLIENT_SECRET
 * Optional:
 *   GARMIN_REDIRECT_URI   - the OAuth redirect URL set on the app in the developer
 *                           portal (default https://api.rooka.io/garminredirect)
 *   GARMIN_WEBHOOK_TOKEN  - secret path segment in the webhook URLs entered in
 *                           Garmin's API Tools (routes/garmin.js); webhooks are
 *                           refused while it is unset
 *
 * Tokens: access tokens last 24 hours; refresh tokens about 90 days, and every
 * refresh hands out a new one. refreshExpiringConnections (daily cron) renews
 * refresh tokens that run out within REFRESH_AHEAD_SEC, so an athlete who
 * doesn't open rooka for a while stays connected.
 */
const crypto = require("crypto");
const db = require("./db");
const { encrypt, decrypt } = require("./crypto");

// Overridable so the integration can be tested against a fake server.
const AUTHORIZE_URL = process.env.GARMIN_AUTHORIZE_URL || "https://connect.garmin.com/oauth2Confirm";
const TOKEN_URL = process.env.GARMIN_TOKEN_URL || "https://diauth.garmin.com/di-oauth2-service/oauth/token";
const API_BASE = process.env.GARMIN_API_BASE || "https://apis.garmin.com";
const DEFAULT_REDIRECT_URI = "https://api.rooka.io/garminredirect";

const STATE_TTL_MS = 15 * 60 * 1000;
// Garmin asks for at least 600 s of slack before the access token expires.
const REFRESH_MARGIN_SEC = 10 * 60;
const REFRESH_AHEAD_SEC = 30 * 24 * 3600;

const dbGet = (sql, params = []) =>
  new Promise((resolve, reject) => db.get(sql, params, (e, row) => (e ? reject(e) : resolve(row))));
const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) => db.all(sql, params, (e, rows) => (e ? reject(e) : resolve(rows || []))));
const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, function (e) {
      return e ? reject(e) : resolve(this);
    }),
  );

function isConfigured() {
  return !!(process.env.GARMIN_CLIENT_ID && process.env.GARMIN_CLIENT_SECRET);
}

function redirectUri() {
  return process.env.GARMIN_REDIRECT_URI || DEFAULT_REDIRECT_URI;
}

// ---------------------------------------------------------------------------
// OAuth 2.0 PKCE
// ---------------------------------------------------------------------------

/** A random verifier (64 chars of [A-Za-z0-9_-]) and its S256 challenge. */
function pkcePair() {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/** Starts a connect for the user: stores the verifier under a fresh state, returns Garmin's consent URL. */
async function authorizeUrl(userId, now = Date.now()) {
  const { verifier, challenge } = pkcePair();
  const state = crypto.randomBytes(24).toString("base64url");
  await dbRun(`DELETE FROM garmin_oauth_pending WHERE expires_at < ?`, [now]);
  await dbRun(
    `INSERT INTO garmin_oauth_pending (state, user_id, code_verifier, expires_at) VALUES (?, ?, ?, ?)`,
    [state, userId, encrypt(verifier), now + STATE_TTL_MS],
  );
  const params = new URLSearchParams({
    client_id: process.env.GARMIN_CLIENT_ID,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    redirect_uri: redirectUri(),
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/** The connect waiting under this state, used once: { userId, verifier }, or null when unknown or expired. */
async function takePending(state, now = Date.now()) {
  if (!state) return null;
  const row = await dbGet(`SELECT * FROM garmin_oauth_pending WHERE state = ?`, [String(state)]);
  if (!row) return null;
  await dbRun(`DELETE FROM garmin_oauth_pending WHERE state = ?`, [row.state]);
  if (row.expires_at < now) return null;
  return { userId: row.user_id, verifier: decrypt(row.code_verifier) };
}

class GarminAuthError extends Error {}

async function postToken(form) {
  const res = await fetch(TOKEN_URL, {
    signal: AbortSignal.timeout(15000),
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      ...form,
      client_id: process.env.GARMIN_CLIENT_ID,
      client_secret: process.env.GARMIN_CLIENT_SECRET,
    }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const msg = data.error_description || data.error || `HTTP ${res.status}`;
    // invalid_grant: this athlete's refresh token is dead (access removed in Garmin
    // Connect, or expired). Anything else may be ours or Garmin's and is not a disconnect.
    const Err = data.error === "invalid_grant" ? GarminAuthError : Error;
    throw new Err(`Garmin token request failed: ${msg}`);
  }
  return data;
}

async function garminApi(accessToken, pathname, { method = "GET" } = {}) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    signal: AbortSignal.timeout(15000),
    method,
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  const text = await res.text().catch(() => "");
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {}
  return { res, data };
}

async function fetchGarminUserId(accessToken) {
  const { res, data } = await garminApi(accessToken, "/partner-gateway/rest/user/id");
  if (!res.ok || !data || !data.userId) throw new Error(`Garmin user id request failed: HTTP ${res.status}`);
  return String(data.userId);
}

/** What the athlete agreed to share, e.g. ["ACTIVITY_EXPORT", "HEALTH_EXPORT", "WORKOUT_IMPORT"]. */
async function fetchPermissions(accessToken) {
  const { res, data } = await garminApi(accessToken, "/partner-gateway/rest/user/permissions");
  if (!res.ok) throw new Error(`Garmin permissions request failed: HTTP ${res.status}`);
  const list = Array.isArray(data) ? data : data && data.permissions;
  return Array.isArray(list) ? list : [];
}

function tokenColumns(data, now) {
  const nowSec = Math.floor(now / 1000);
  return {
    access: encrypt(data.access_token),
    refresh: encrypt(data.refresh_token),
    expiresAt: nowSec + (Number(data.expires_in) || 24 * 3600),
    refreshExpiresAt: data.refresh_token_expires_in ? nowSec + Number(data.refresh_token_expires_in) : null,
  };
}

/** The pre-API login (username/password from the parked direct login). Deleted once the official connection exists. */
async function clearLegacyLogin(userId) {
  await dbRun(
    `UPDATE users SET garmin_username = NULL, garmin_password = NULL, garmin_oauth1_token = NULL, garmin_oauth2_token = NULL WHERE id = ?`,
    [userId],
  );
}

/** Finishes a connect: swaps the code, links the Garmin account to the user and stores the tokens. */
async function exchangeCode(userId, code, verifier, now = Date.now()) {
  const data = await postToken({
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri(),
  });

  let garminUserId;
  try {
    garminUserId = await fetchGarminUserId(data.access_token);
  } catch (e) {
    // Without the id Garmin's pushes can't be matched to the athlete, so don't keep
    // a half connection on either side.
    await garminApi(data.access_token, "/partner-gateway/rest/user/registration", { method: "DELETE" }).catch(() => {});
    throw e;
  }

  // Garmin's pushes name only the Garmin user, so one Garmin account feeds one rooka
  // account: connecting it again from another rooka account moves it there.
  const others = await dbAll(`SELECT user_id FROM garmin_tokens WHERE garmin_user_id = ? AND user_id != ?`, [garminUserId, userId]);
  for (const o of others) {
    console.warn(`[Garmin] Garmin account moved from user ${o.user_id} to user ${userId}`);
    await forgetUser(o.user_id);
  }

  const permissions = await fetchPermissions(data.access_token).catch(() => null);
  const t = tokenColumns(data, now);
  await dbRun(
    `INSERT INTO garmin_tokens (user_id, garmin_user_id, access_token, refresh_token, expires_at, refresh_expires_at, permissions, connected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       garmin_user_id = excluded.garmin_user_id,
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       expires_at = excluded.expires_at,
       refresh_expires_at = excluded.refresh_expires_at,
       permissions = excluded.permissions,
       connected_at = excluded.connected_at`,
    [userId, garminUserId, t.access, t.refresh, t.expiresAt, t.refreshExpiresAt, permissions ? JSON.stringify(permissions) : null, new Date(now).toISOString()],
  );
  // The privacy policy promises the stored Garmin password goes once the official connection is in.
  await clearLegacyLogin(userId);
  return { garminUserId, permissions };
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

// One refresh at a time per user: every refresh rotates the refresh token, so the
// second of two parallel refreshes would fail with invalid_grant and look like a disconnect.
const refreshing = new Map();

function refreshTokens(userId, row, now) {
  if (!refreshing.has(userId)) {
    const p = (async () => {
      try {
        const oldRefresh = decrypt(row.refresh_token);
        const data = await postToken({ grant_type: "refresh_token", refresh_token: oldRefresh });
        if (!data.refresh_token) data.refresh_token = oldRefresh;
        const t = tokenColumns(data, now);
        await dbRun(
          `UPDATE garmin_tokens SET access_token = ?, refresh_token = ?, expires_at = ?,
             refresh_expires_at = COALESCE(?, refresh_expires_at) WHERE user_id = ?`,
          [t.access, t.refresh, t.expiresAt, t.refreshExpiresAt, userId],
        );
        return data.access_token;
      } catch (e) {
        if (e instanceof GarminAuthError) {
          // Access is gone on Garmin's side: show the athlete as disconnected.
          console.warn(`[Garmin] refresh refused for user ${userId}; forgetting the connection`);
          await forgetUser(userId);
          return null;
        }
        throw e;
      }
    })().finally(() => refreshing.delete(userId));
    refreshing.set(userId, p);
  }
  return refreshing.get(userId);
}

/** A valid access token (refreshed when it expires within 10 minutes), or null when not connected. */
async function getValidAccessToken(userId, now = Date.now()) {
  const row = await dbGet(`SELECT * FROM garmin_tokens WHERE user_id = ?`, [userId]);
  if (!row) return null;
  if (row.expires_at - REFRESH_MARGIN_SEC > Math.floor(now / 1000)) return decrypt(row.access_token);
  return refreshTokens(userId, row, now);
}

/** Daily: renews connections whose refresh token runs out within 30 days. */
async function refreshExpiringConnections(now = Date.now()) {
  const rows = await dbAll(
    `SELECT * FROM garmin_tokens WHERE refresh_expires_at IS NOT NULL AND refresh_expires_at < ?`,
    [Math.floor(now / 1000) + REFRESH_AHEAD_SEC],
  );
  let renewed = 0;
  for (const row of rows) {
    try {
      if (await refreshTokens(row.user_id, row, now)) renewed++;
    } catch (e) {
      console.error(`[Garmin] token renewal failed for user ${row.user_id}:`, e.message);
    }
  }
  return { checked: rows.length, renewed };
}

// ---------------------------------------------------------------------------
// Connection state
// ---------------------------------------------------------------------------

async function forgetUser(userId) {
  await dbRun(`DELETE FROM garmin_tokens WHERE user_id = ?`, [userId]);
  await dbRun(`DELETE FROM garmin_oauth_pending WHERE user_id = ?`, [userId]);
}

/**
 * Ends the official connection: asks Garmin to delete the registration (required
 * whenever the athlete disconnects or deletes their account in rooka; best effort)
 * and forgets the tokens here.
 */
async function disconnect(userId) {
  let token = null;
  try {
    token = await getValidAccessToken(userId);
  } catch (e) {
    console.error(`[Garmin] no token to deregister user ${userId}:`, e.message);
  }
  if (token) {
    try {
      const { res } = await garminApi(token, "/partner-gateway/rest/user/registration", { method: "DELETE" });
      if (!res.ok && res.status !== 404) console.error(`[Garmin] deregistration for user ${userId} answered HTTP ${res.status}`);
    } catch (e) {
      console.error(`[Garmin] deregistration for user ${userId} failed:`, e.message);
    }
  }
  await forgetUser(userId);
}

function parsePermissions(json) {
  try {
    const list = JSON.parse(json || "null");
    return Array.isArray(list) ? list : null;
  } catch (_) {
    return null;
  }
}

/** For the app: { connected, permissions } (permissions null when Garmin hasn't said). */
async function connectionStatus(userId) {
  const row = await dbGet(`SELECT permissions FROM garmin_tokens WHERE user_id = ?`, [userId]).catch(() => null);
  return { connected: !!row, permissions: row ? parsePermissions(row.permissions) : null };
}

/**
 * Whether Garmin data can be in what the AI sees for this athlete: a connection, or Garmin
 * workouts or health days still stored after a disconnect. Garmin's license (§15.11) bars
 * building an AI-generated knowledge base from that data, so for these athletes the coach's
 * memory is written from the athlete's own words only, and the public bio isn't AI-written.
 */
async function hasGarminData(userId) {
  const row = await dbGet(
    `SELECT EXISTS (SELECT 1 FROM garmin_tokens WHERE user_id = ?)
         OR EXISTS (SELECT 1 FROM activities WHERE user_id = ? AND garmin_activity_id IS NOT NULL)
         OR EXISTS (SELECT 1 FROM biometrics WHERE user_id = ? AND from_garmin = 1) AS yes`,
    [userId, userId, userId],
  ).catch(() => null);
  // Unknown counts as yes: the safe side of the license.
  return row ? !!row.yes : true;
}

// ---------------------------------------------------------------------------
// Webhooks (configured in Garmin's API Tools)
// ---------------------------------------------------------------------------

/** { deregistrations: [{ userId }] }: the athlete removed rooka in Garmin Connect (or we deregistered). */
async function handleDeregistrations(body) {
  const list = Array.isArray(body && body.deregistrations) ? body.deregistrations : [];
  let removed = 0;
  for (const d of list) {
    if (!d || !d.userId) continue;
    const rows = await dbAll(`SELECT user_id FROM garmin_tokens WHERE garmin_user_id = ?`, [String(d.userId)]);
    for (const r of rows) {
      await forgetUser(r.user_id);
      removed++;
    }
  }
  return removed;
}

/** { userPermissionsChange: [{ userId, permissions: [...] }] }: the athlete changed what they share. */
async function handlePermissionChanges(body) {
  const list = Array.isArray(body && body.userPermissionsChange) ? body.userPermissionsChange : [];
  let updated = 0;
  for (const p of list) {
    if (!p || !p.userId || !Array.isArray(p.permissions)) continue;
    const r = await dbRun(`UPDATE garmin_tokens SET permissions = ? WHERE garmin_user_id = ?`, [JSON.stringify(p.permissions), String(p.userId)]);
    updated += r.changes || 0;
  }
  return updated;
}

module.exports = {
  isConfigured,
  redirectUri,
  authorizeUrl,
  takePending,
  exchangeCode,
  getValidAccessToken,
  refreshExpiringConnections,
  disconnect,
  forgetUser,
  connectionStatus,
  hasGarminData,
  handleDeregistrations,
  handlePermissionChanges,
  // exported for tests
  pkcePair,
};
