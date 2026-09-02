const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { createSnapshot, listSnapshots } = require("../services/backup");

const tag = process.argv[2] || "cli_manual";
console.log(`Starting database snapshot with tag: ${tag}...`);

createSnapshot(tag)
  .then((res) => {
    console.log("Snapshot successfully created!");
    console.log(`Filename: ${res.filename}`);
    console.log(`Location: ${res.filepath}`);
    console.log(`Size:     ${(res.size / 1024).toFixed(1)} KB`);
    console.log(`Created:  ${res.createdAt}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Snapshot failed:", err);
    process.exit(1);
  });
