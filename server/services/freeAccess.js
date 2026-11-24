// Ends free periods from free-access discount codes.
//
// The code's rooka+ comes from a RevenueCat promotional grant, which simply
// lapses at its end time. RevenueCat does not document an EXPIRATION webhook
// for those, so the server does not wait for one: every hour it looks for
// grants that ended, asks RevenueCat whether the athlete still has rooka+ from
// anything else (they may have subscribed meanwhile), and moves them back to
// free if not. Each grant is checked until it is settled, then closed.

const db = require("./db");
const revenuecat = require("./revenuecat");
const { downgradeToFree } = require("./subscriptionTier");

// RevenueCat may take a moment to let a grant lapse; checking right on the
// minute could find it still active and close the grant without a downgrade.
const GRACE_MS = 10 * 60 * 1000;

const all = (sql, params = []) =>
  new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || []))));
const run = (sql, params = []) =>
  new Promise((resolve, reject) => db.run(sql, params, (err) => (err ? reject(err) : resolve())));

async function closeGrant(id) {
  await run(`UPDATE discount_redemptions SET grant_closed_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
}

/** Returns how many athletes went back to free, for the log and the tests. */
async function expireEndedFreeAccess(now = new Date()) {
  if (!revenuecat.isConfigured()) return 0;

  const cutoff = new Date(now.getTime() - GRACE_MS).toISOString();
  const ended = await all(
    `SELECT r.id, r.user_id, u.subscription_tier AS tier
       FROM discount_redemptions r
       JOIN users u ON u.id = r.user_id
      WHERE r.granted_until IS NOT NULL
        AND r.grant_closed_at IS NULL
        AND r.granted_until <= ?`,
    [cutoff],
  );

  let downgraded = 0;
  for (const grant of ended) {
    if (grant.tier !== "rooka_plus") {
      // Already free (or an admin): nothing to undo.
      await closeGrant(grant.id);
      continue;
    }
    let stillActive;
    try {
      stillActive = await revenuecat.hasActiveRookaEntitlement(grant.user_id);
    } catch (err) {
      // Leave it open; the next run tries again.
      console.error(`[FreeAccess] RevenueCat lookup for user ${grant.user_id} failed:`, err.message);
      continue;
    }
    if (!stillActive && (await downgradeToFree(grant.user_id))) {
      downgraded += 1;
      console.log(`[FreeAccess] Free period of user ${grant.user_id} ended; back to free.`);
    }
    await closeGrant(grant.id);
  }
  return downgraded;
}

module.exports = { expireEndedFreeAccess, GRACE_MS };
