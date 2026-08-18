const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./rooka_multi.db');
db.run("ALTER TABLE chat_history ADD COLUMN image_path TEXT", (err) => {
  if (err && err.message.includes("duplicate column name")) {
    console.log("Column already exists");
  } else if (err) {
    console.error("Migration error:", err);
  } else {
    console.log("Migration successful");
  }
});
