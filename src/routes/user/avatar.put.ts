/**
 * Avatar Upload Endpoint
 * PUT /api/user/avatar
 */

import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { getPgDb } from "@/utils/dbPostgres";
import { success, error } from "@/lib/responseFormat";
import { createAuditLog, AuditActions } from "@/services/audit";
import { authenticate } from "@/middleware/auth";

const router = express.Router();

// Configure multer for file uploads
const uploadDir = process.env.FILE_UPLOAD_PATH || "./uploads";
const maxFileSize = parseInt(process.env.MAX_FILE_SIZE || "5242880"); // 5MB default

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const avatarDir = path.join(uploadDir, "avatars");
    if (!fs.existsSync(avatarDir)) {
      fs.mkdirSync(avatarDir, { recursive: true });
    }
    cb(null, avatarDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${uniqueSuffix}${ext}`);
  },
});

// File filter for images only
const fileFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: maxFileSize,
  },
});

/**
 * PUT /api/user/avatar
 * Upload user avatar
 */
router.put("/", authenticate, upload.single("avatar"), async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).send(error("Unauthorized"));
    }

    if (!req.file) {
      return res.status(400).send(error("No file uploaded"));
    }

    const db = getPgDb();

    // Get the file path (relative for storage)
    const avatarPath = `/uploads/avatars/${req.file.filename}`;

    // Update user avatar
    await db("users").where("id", userId).update({ avatar_url: avatarPath });

    // Create audit log
    await createAuditLog(
      {
        userId,
        action: AuditActions.AVATAR_UPDATED,
        ipAddress: req.ip || null,
        userAgent: req.get("User-Agent") || null,
        metadata: { avatarPath },
      },
      req
    );

    return res.status(200).send(
      success(
        {
          avatarUrl: avatarPath,
        },
        "Avatar uploaded successfully"
      )
    );
  } catch (err) {
    console.error("Avatar upload error:", err);
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).send(error("File size exceeds 5MB limit"));
      }
      return res.status(400).send(error(err.message));
    }
    return res.status(500).send(error("Internal server error"));
  }
});

export default router;