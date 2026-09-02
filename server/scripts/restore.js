const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { restoreSnapshot, listSnapshots } = require("../services/backup");

const filename = process.argv[2];
if (!filename) {
  console.log("Usage: node scripts/restore.js <snapshot_filename_or_index>");
  console.log("\nAvailable snapshots:");
  const list = listSnapshots();
  if (list.length === 0) {
    console.log("  (No snapshots found in backups/)");
  } else {
    list.forEach((s, idx) => {
      console.log(`  [${idx + 1}] ${s.filename} (${s.sizeFormatted}, ${s.createdAt})`);
    });
  }
  process.exit(1);
}

let targetFilename = filename;
const list = listSnapshots();
const idx = parseInt(filename, 10);
if (!isNaN(idx) && idx >= 1 && idx <= list.length) {
  targetFilename = list[idx - 1].filename;
}

console.log(`Restoring snapshot: ${targetFilename}...`);
restoreSnapshot(targetFilename)
  .then((res) => {
    console.log(` SUCCESS: ${res.message}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Restore failed:", err.message);
    process.exit(1);
  });
