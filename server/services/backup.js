const path = require("path");
const fs = require("fs");
const db = require("./db");

const BACKUP_DIR = path.join(__dirname, "..", "backups");

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  } catch (e) {
    console.error("Failed to create backups directory:", e);
  }
}

/**
 * Creates an atomic live snapshot of the SQLite database using native VACUUM INTO.
 * @param {string} [tag="auto"] Optional tag/name for the snapshot
 * @returns {Promise<{ success: boolean, filename: string, filepath: string, size: number }>}
 */
function createSnapshot(tag = "auto") {
  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }

      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      const safeTag = String(tag).replace(/[^a-zA-Z0-9_-]/g, "");
      const filename = `rooka_snapshot_${timestamp}_${safeTag}.db`;
      const targetPath = path.join(BACKUP_DIR, filename);

      const escapedPath = targetPath.replace(/"/g, '""');

      db.run(`VACUUM INTO "${escapedPath}"`, (err) => {
        if (err) {
          console.error("[BACKUP] Error creating snapshot:", err.message);
          return reject(err);
        }

        const stats = fs.existsSync(targetPath) ? fs.statSync(targetPath) : { size: 0 };
        console.log(`[BACKUP] Snapshot created successfully: ${filename} (${(stats.size / 1024).toFixed(1)} KB)`);

        cleanupOldSnapshots(14).catch(() => {});

        resolve({
          success: true,
          filename,
          filepath: targetPath,
          size: stats.size,
          createdAt: now.toISOString(),
        });
      });
    } catch (e) {
      console.error("[BACKUP] Unexpected snapshot failure:", e);
      reject(e);
    }
  });
}

/**
 * Lists all available snapshots in chronological order (newest first).
 */
function listSnapshots() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".db"));
    return files
      .map((filename) => {
        const fullPath = path.join(BACKUP_DIR, filename);
        const stats = fs.statSync(fullPath);
        return {
          filename,
          size: stats.size,
          sizeFormatted: `${(stats.size / 1024).toFixed(1)} KB`,
          createdAt: stats.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (e) {
    console.error("[BACKUP] Error listing snapshots:", e);
    return [];
  }
}

/**
 * Restores a snapshot file by replacing the active database file.
 */
function restoreSnapshot(filename) {
  return new Promise((resolve, reject) => {
    try {
      const snapshotPath = path.join(BACKUP_DIR, path.basename(filename));
      if (!fs.existsSync(snapshotPath)) {
        return reject(new Error(`Snapshot file not found: ${filename}`));
      }

      const activeDbPath = process.env.DB_PATH
        ? path.resolve(__dirname, "..", process.env.DB_PATH)
        : path.join(__dirname, "..", "rooka_native.db");

      createSnapshot("pre_restore")
        .then(() => {
          fs.copyFileSync(snapshotPath, activeDbPath);
          console.log(`[BACKUP] Successfully restored database from ${filename}`);
          resolve({ success: true, message: `Database restored from ${filename}. Restart server to apply.` });
        })
        .catch(reject);
    } catch (e) {
      console.error("[BACKUP] Error restoring snapshot:", e);
      reject(e);
    }
  });
}

/**
 * Automatically removes snapshots older than retentionDays.
 */
function cleanupOldSnapshots(retentionDays = 14) {
  return new Promise((resolve) => {
    try {
      if (!fs.existsSync(BACKUP_DIR)) return resolve(0);
      const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".db"));
      let deletedCount = 0;

      files.forEach((file) => {
        const fullPath = path.join(BACKUP_DIR, file);
        const stats = fs.statSync(fullPath);
        if (stats.mtimeMs < cutoffTime) {
          fs.unlinkSync(fullPath);
          deletedCount++;
        }
      });

      if (deletedCount > 0) {
        console.log(`[BACKUP] Cleaned up ${deletedCount} snapshots older than ${retentionDays} days.`);
      }
      resolve(deletedCount);
    } catch (e) {
      console.error("[BACKUP] Error cleaning up old snapshots:", e);
      resolve(0);
    }
  });
}

module.exports = {
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
  cleanupOldSnapshots,
};
