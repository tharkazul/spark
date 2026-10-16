// Grants (or with --revoke, removes) admin access: users.role = 'admin'.
// Usage: node scripts/grant-admin.js <email|username|id> [--revoke]
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const db = require("../services/db");

const args = process.argv.slice(2);
const revoke = args.includes("--revoke");
const who = args.find((a) => !a.startsWith("--"));

if (!who) {
  console.error("Usage: node scripts/grant-admin.js <email|username|id> [--revoke]");
  process.exit(1);
}

const ident = who.trim().toLowerCase();
db.all(
  `SELECT id, username, email, role FROM users
   WHERE deleted_at IS NULL AND (CAST(id AS TEXT) = ? OR LOWER(username) = ? OR LOWER(email) = ?)`,
  [ident, ident, ident],
  (err, rows) => {
    if (err) throw err;
    if (rows.length !== 1) {
      console.error(rows.length ? "Ambiguous, matches:" : "No active user matches.", rows);
      process.exit(1);
    }
    const user = rows[0];
    db.run(`UPDATE users SET role = ? WHERE id = ?`, [revoke ? "user" : "admin", user.id], (uErr) => {
      if (uErr) throw uErr;
      console.log(`${user.username} (id ${user.id}, ${user.email}) role: ${user.role || "user"} -> ${revoke ? "user" : "admin"}`);
      db.close();
    });
  },
);
