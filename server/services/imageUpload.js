const path = require("path");

// Shared multer options for photo uploads (profile pictures, coach avatars,
// physique photos). The stored filename keeps the client's extension and some
// of these land in public/uploads, so the extension is checked as well as the
// MIME type: an "image/png" called evil.html must not be served as HTML.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_MIME = /^image\/(jpe?g|png|webp|heic|heif|gif)$/i;
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".gif"]);

function imageFileFilter(req, file, cb) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (IMAGE_MIME.test(file.mimetype || "") && IMAGE_EXT.has(ext)) return cb(null, true);
  const err = new Error("Only JPEG, PNG, WebP, HEIC or GIF images can be uploaded.");
  err.status = 400;
  err.code = "UNSUPPORTED_FILE_TYPE";
  cb(err);
}

const imageUploadOptions = {
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: imageFileFilter,
};

module.exports = { imageUploadOptions, MAX_IMAGE_BYTES };
