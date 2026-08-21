const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  let token = authHeader && authHeader.split(" ")[1];
  if (!token && req.query.token) token = req.query.token;

  if (token == null || token === "null")
    return res.status(401).json({ error: "No token provided" });

  jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true }, (err, user) => {
    if (err) {
      console.error("JWT Verification failed:", err.message);
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
}

module.exports = { authenticateToken };
