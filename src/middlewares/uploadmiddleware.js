import multer from "multer";
import path from "path";
import fs from "fs";

const ensureDir = (uploadPath) => {
  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }
};

const allowedImageExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
  ".jfif",
]);

const imageFileFilter = (req, file, cb) => {
  const mimetype = (file.mimetype || "").toLowerCase();
  const extension = path.extname(file.originalname || "").toLowerCase();
  const isImageMime = mimetype.startsWith("image/");
  const isImageExtension = allowedImageExtensions.has(extension);

  if (!isImageMime && !isImageExtension) {
    return cb(new Error("Only image files are allowed"));
  }
  cb(null, true);
};

const createUpload = (uploadPath) => {
  ensureDir(uploadPath);

  const storage = multer.diskStorage({
    destination: uploadPath,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, unique + ext);
    },
  });

  return multer({
    storage,
    fileFilter: imageFileFilter,
    limits: { fileSize: 5 * 1024 * 1024 },
  });
};

export const uploadLogoMiddleware = createUpload("uploads/org_logos/").single("logo");
export const uploadTaskImageMiddleware = createUpload("uploads/task_images/").single("image");

