// The two tier changes a subscription event can cause, in one place so the
// RevenueCat webhook, free-access codes and the free-access expiry check all
// move an athlete in and out of rooka+ the same way. Admin accounts are never
// touched: their tier is set by hand.

const db = require("./db");

function run(sql, params) {
  return new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this.changes);
    }),
  );
}

async function upgradeToRookaPlus(userId) {
  return run(
    `UPDATE users SET subscription_tier = 'rooka_plus', daily_token_limit = 50000
      WHERE id = ? AND COALESCE(subscription_tier, 'free') != 'admin'`,
    [userId],
  );
}

async function downgradeToFree(userId) {
  const changed = await run(
    `UPDATE users SET subscription_tier = 'free', daily_token_limit = 5000
      WHERE id = ? AND COALESCE(subscription_tier, 'free') != 'admin'`,
    [userId],
  );
  if (changed) {
    await run(`UPDATE user_quests SET status = 'closed' WHERE user_id = ? AND status = 'active'`, [userId]).catch(
      (err) => {
        if (!/no such table/.test(err.message)) throw err;
      },
    );
  }
  return changed;
}

module.exports = { upgradeToRookaPlus, downgradeToFree };
