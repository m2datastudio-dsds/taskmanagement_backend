import multer from "multer";
import path from "path";
import fs from "fs";

// Ensure upload folder exists
const uploadPath = "uploads/org_logos/";
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: uploadPath,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + ext);
  },
});

const upload = multer({ storage });

export const uploadLogoMiddleware = upload.single("logo");
