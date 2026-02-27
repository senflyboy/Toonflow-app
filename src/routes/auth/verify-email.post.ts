/**
 * Email Verification Endpoint
 * POST /api/auth/verify-email
 */

import express from "express";
import { z } from "zod";
import { getPgDb } from "@/utils/dbPostgres";
import { success, error } from "@/lib/responseFormat";
import { createAuditLog, AuditActions } from "@/services/audit";

const router = express.Router();

// Email verification schema
const verifyEmailSchema = z.object({
  email: z.string().email("Invalid email format"),
  code: z.string().length(6, "Verification code must be 6 digits"),
});

/**
 * POST /api/auth/verify-email
 * Verify email with code
 */
router.post("/", async (req, res) => {
  try {
    const validation = verifyEmailSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).send(error(validation.error.issues[0].message));
    }

    const { email, code } = validation.data;
    const db = getPgDb();

    // Find verification code
    const verificationCode = await db("sms_codes")
      .where("phone", email)
      .where("purpose", "verify_email")
      .where("used", false)
      .where("expires_at", ">", new Date())
      .orderBy("created_at", "desc")
      .first();

    if (!verificationCode) {
      return res.status(400).send(error("Invalid or expired verification code"));
    }

    if (verificationCode.code !== code) {
      return res.status(400).send(error("Invalid verification code"));
    }

    // Mark code as used
    await db("sms_codes").where("id", verificationCode.id).update({ used: true });

    // Find user and update email_verified
    const user = await db("users").where("email", email).first();
    if (!user) {
      return res.status(404).send(error("User not found"));
    }

    await db("users").where("id", user.id).update({ email_verified: true });

    // Create audit log
    await createAuditLog(
      {
        userId: user.id,
        action: AuditActions.EMAIL_VERIFIED,
        ipAddress: req.ip || null,
        userAgent: req.get("User-Agent") || null,
        metadata: { email },
      },
      req
    );

    return res.status(200).send(success({ emailVerified: true }, "Email verified successfully"));
  } catch (err) {
    console.error("Email verification error:", err);
    return res.status(500).send(error("Internal server error"));
  }
});

export default router;