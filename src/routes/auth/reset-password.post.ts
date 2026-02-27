import express from "express";
import { z } from "zod";
import { getPgDb } from "@/utils/dbPostgres";
import { hashPassword, passwordSchema, emailSchema, phoneSchema } from "@/utils/password";
import { success, error } from "@/lib/responseFormat";
import { createAuditLog, AuditActions } from "@/services/audit";
import { verifySmsCode } from "@/services/sms";

const router = express.Router();

// Reset password schema - requires email or phone + code + new password
const resetPasswordSchema = z.object({
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  code: z.string().length(6, "Verification code must be 6 digits"),
  newPassword: passwordSchema,
}).refine((data) => data.email || data.phone, {
  message: "Either email or phone is required",
  path: ["email"],
});

/**
 * POST /api/auth/reset-password
 * Reset password using verification code
 */
router.post("/", async (req, res) => {
  try {
    const validation = resetPasswordSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).send(error(validation.error.issues[0].message));
    }

    const { email, phone, code, newPassword } = validation.data;
    const db = getPgDb();

    // Find user
    let user = null;
    if (email) {
      user = await db("users").where("email", email).first();
    } else if (phone) {
      user = await db("users").where("phone", phone).first();
    }

    if (!user) {
      return res.status(400).send(error("Invalid verification code or user not found"));
    }

    // Verify SMS code
    if (phone) {
      const verification = await verifySmsCode(phone, code, "reset_password");
      if (!verification.valid) {
        return res.status(400).send(error(verification.error || "Invalid verification code"));
      }
    } else if (email) {
      // Email verification deferred to Phase 3
      // For now, require a specific dev code
      const devCode = process.env.PASSWORD_RESET_DEV_CODE;
      if (devCode && code !== devCode) {
        return res.status(400).send(error("Invalid verification code"));
      }
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update user password and reset security counters
    await db("users")
      .where("id", user.id)
      .update({
        password_hash: newPasswordHash,
        failed_login_attempts: 0,
        locked_until: null,
        updated_at: new Date(),
      });

    // Revoke all existing refresh tokens (force re-login)
    await db("refresh_tokens").where("user_id", user.id).del();

    // Create audit log for password reset
    await createAuditLog(
      {
        userId: user.id,
        action: AuditActions.PASSWORD_RESET_COMPLETED,
        ipAddress: req.ip || null,
        userAgent: req.get("User-Agent") || null,
        metadata: { email, phone },
      },
      req
    );

    return res.status(200).send(success(null, "Password reset successfully"));
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).send(error("Internal server error"));
  }
});

export default router;