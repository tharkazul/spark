const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../services/db");

// Register a new friend
router.post("/register", async (req, res) => {
  const { username, email, password, context } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const nowIso = new Date().toISOString();
    const cleanUsername = (username || email || "").trim();
    const cleanEmail = (email || (cleanUsername.includes("@") ? cleanUsername : "")).trim().toLowerCase() || null;

    db.run(
      // coach_name is set explicitly: older databases still default this column
      // to the pre-rename value 'Spark'.
      `INSERT INTO users (username, email, password_hash, athlete_context, rooka_start_date, coach_name) VALUES (?, ?, ?, ?, ?, ?)`,
      [cleanUsername, cleanEmail, hashedPassword, context || "New athlete.", nowIso, "Rooka"],
      function (err) {
        if (err)
          return res
            .status(400)
            .json({ error: "Username or email might already exist." });
        res
          .status(201)
          .json({
            message: "Athlete registered successfully!",
            userId: this.lastID,
          });
      },
    );
  } catch (error) {
    res.status(500).json({ error: "Registration failed." });
  }
});

// Login and get a token
router.post("/login", (req, res) => {
  const { username, password } = req.body;
  const identifier = (username || "").trim().toLowerCase();

  if (!identifier || !password) {
    return res.status(400).json({ error: "Please enter your username/email and password." });
  }

  db.get(
    `SELECT * FROM users 
     WHERE (LOWER(username) = ? OR (email IS NOT NULL AND LOWER(email) = ?)) 
       AND deleted_at IS NULL 
     LIMIT 1`,
    [identifier, identifier],
    async (err, user) => {
      if (err || !user)
        return res.status(400).json({
          error: "No account found with that email or username.",
          code: "ACCOUNT_NOT_FOUND",
        });

      if (await bcrypt.compare(password, user.password_hash)) {
        const token = jwt.sign(
          { id: user.id, username: user.username },
          process.env.JWT_SECRET,
          { expiresIn: "30d" },
        );
        db.run(`UPDATE users SET login_count = login_count + 1 WHERE id = ?`, [
          user.id,
        ]);
        res.json({ token, message: "Welcome to Rooka HQ" });
      } else {
        res.status(401).json({ error: "Incorrect password." });
      }
    },
  );
});

// Waitlist / Beta Signup endpoint
router.post("/waitlist", (req, res) => {
  const { email, notes } = req.body;
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "A valid email address is required." });
  }

  const cleanEmail = email.trim().toLowerCase();
  db.run(
    `INSERT INTO waitlist (email, notes) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET notes = excluded.notes`,
    [cleanEmail, notes || "Web TestFlight signup"],
    function (err) {
      if (err) {
        console.error("Waitlist DB error:", err);
        return res.status(500).json({ error: "Failed to record waitlist entry." });
      }
      console.log(`✉️ New TestFlight waitlist signup: ${cleanEmail}`);
      res.json({ success: true, message: "Added to TestFlight waitlist successfully." });
    }
  );
});

module.exports = router;
