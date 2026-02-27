import express from "express";
import { z } from "zod";
import { getPgDb } from "@/utils/dbPostgres";
import { success, error } from "@/lib/responseFormat";
import { authenticate } from "@/middleware/auth";
import { createAuditLog, AuditActions } from "@/services/audit";

const router = express.Router();

// Update profile schema
const updateProfileSchema = z.object({
  username: z.string().min(1, "Username cannot be empty").max(20, "Username too long").optional(),
  avatar: z.string().optional(), // base64 data URL
});

// Verify password schema (for email/phone change)
const verifyPasswordSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

/**
 * PUT /api/user/profile
 * Update current user's profile (username, avatar)
 */
router.put("/", authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).send(error("Unauthorized"));
    }

    const validation = updateProfileSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).send(error(validation.error.issues[0].message));
    }

    const { username, avatar } = validation.data;
    const db = getPgDb();

    // Check if username is already taken (if provided)
    if (username) {
      const existingUser = await db("users")
        .where("username", username)
        .whereNot("id", userId)
        .first();

      if (existingUser) {
        return res.status(409).send(error("Username already taken"));
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (username !== undefined) {
      updateData.username = username;
    }
    if (avatar !== undefined) {
      updateData.avatar = avatar; // For now, store as base64 (Phase 3 will use cloud storage)
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).send(error("No fields to update"));
    }

    updateData.updated_at = new Date();

    // Update user
    await db("users").where("id", userId).update(updateData);

    // Get updated user
    const updatedUser = await db("users")
      .where("id", userId)
      .select(
        "id",
        "email",
        "phone",
        "username",
        "email_verified",
        "phone_verified",
        "created_at",
        "updated_at"
      )
      .first();

    // Create audit log
    await createAuditLog(
      {
        userId,
        action: AuditActions.PROFILE_UPDATED,
        ipAddress: req.ip || null,
        userAgent: req.get("User-Agent") || null,
        metadata: { updatedFields: Object.keys(updateData).filter(k => k !== "updated_at") },
      },
      req
    );

    return res.status(200).send(success(updatedUser, "Profile updated successfully"));
  } catch (err) {
    console.error("Update profile error:", err);
    return res.status(500).send(error("Internal server error"));
  }
});

/**
 * PUT /api/user/email
 * Change email address (requires password verification)
 */
router.put("/email", authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).send(error("Unauthorized"));
    }

    const emailSchema = z.object({
      email: z.string().email("Invalid email format"),
      password: z.string().min(1, "Password is required"),
    });

    const validation = emailSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).send(error(validation.error.issues[0].message));
    }

    const { email, password } = validation.data;
    const db = getPgDb();

    // Get current user with password hash
    const currentUser = await db("users").where("id", userId).first();
    if (!currentUser) {
      return res.status(404).send(error("User not found"));
    }

    // Verify password
    const { verifyPassword } = await import("@/utils/password");
    const isValidPassword = await verifyPassword(password, currentUser.password_hash);
    if (!isValidPassword) {
      return res.status(401).send(error("Incorrect password"));
    }

    // Check if email is already in use
    const existingUser = await db("users")
      .where("email", email)
      .whereNot("id", userId)
      .first();

    if (existingUser) {
      return res.status(409).send(error("Email already in use"));
    }

    // Update email (reset verification status)
    await db("users")
      .where("id", userId)
      .update({
        email,
        email_verified: false,
        updated_at: new Date(),
      });

    // Create audit log
    await createAuditLog(
      {
        userId,
        action: AuditActions.EMAIL_CHANGED,
        ipAddress: req.ip || null,
        userAgent: req.get("User-Agent") || null,
        metadata: { newEmail: email },
      },
      req
    );

    return res.status(200).send(success(null, "Email changed successfully. Please verify your new email."));
  } catch (err) {
    console.error("Change email error:", err);
    return res.status(500).send(error("Internal server error"));
  }
});

/**
 * PUT /api/user/phone
 * Change phone number (requires SMS code verification)
 */
router.put("/phone", authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).send(error("Unauthorized"));
    }

    const phoneChangeSchema = z.object({
      phone: z.string().regex(/^1[3-9]\d{9}$/, "Invalid phone number"),
      code: z.string().length(6, "Verification code must be 6 digits"),
    });

    const validation = phoneChangeSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).send(error(validation.error.issues[0].message));
    }

    const { phone, code } = validation.data;
    const db = getPgDb();

    // Verify SMS code
    const { verifySmsCode } = await import("@/services/sms");
    const verification = await verifySmsCode(phone, code, "change_phone");
    if (!verification.valid) {
      return res.status(400).send(error(verification.error || "Invalid verification code"));
    }

    // Check if phone is already in use
    const existingUser = await db("users")
      .where("phone", phone)
      .whereNot("id", userId)
      .first();

    if (existingUser) {
      return res.status(409).send(error("Phone number already in use"));
    }

    // Update phone (reset verification status)
    await db("users")
      .where("id", userId)
      .update({
        phone,
        phone_verified: false,
        updated_at: new Date(),
      });

    // Create audit log
    await createAuditLog(
      {
        userId,
        action: AuditActions.PHONE_CHANGED,
        ipAddress: req.ip || null,
        userAgent: req.get("User-Agent") || null,
        metadata: { newPhone: phone },
      },
      req
    );

    return res.status(200).send(success(null, "Phone changed successfully. Please verify your new phone number."));
  } catch (err) {
    console.error("Change phone error:", err);
    return res.status(500).send(error("Internal server error"));
  }
});

export default router;