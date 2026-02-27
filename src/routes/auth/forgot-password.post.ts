import express from "express";
import { z } from "zod";
import { getPgDb } from "@/utils/dbPostgres";
import { success, error } from "@/lib/responseFormat";
import { createAuditLog, AuditActions } from "@/services/audit";
import { sendSmsCode } from "@/services/sms";
import { passwordResetLimiter } from "@/middleware/rate-limit";
import { emailSchema, phoneSchema } from "@/utils/password";

const router = express.Router();

// Apply rate limiting to prevent abuse
router.use(passwordResetLimiter);

// Forgot password schema - either email or phone required
const forgotPasswordSchema = z.object({
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
}).refine((data) => data.email || data.phone, {
  message: "Either email or phone is required",
  path: ["email"],
});

/**
 * POST /api/auth/forgot-password
 * Request password reset - sends verification code to email or phone
 */
router.post("/", async (req, res) => {
  try {
    const validation = forgotPasswordSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).send(error(validation.error.issues[0].message));
    }

    const { email, phone } = validation.data;
    const db = getPgDb();

    let user = null;

    // Find user by email or phone
    if (email) {
      user = await db("users").where("email", email).first();
    } else if (phone) {
      user = await db("users").where("phone", phone).first();
    }

    // Security best practice: Always return success to prevent user enumeration
    // Don't reveal whether the user exists or not
    if (!user) {
      return res.status(200).send(
        success(null, "If an account exists, a reset code will be sent")
      );
    }

    // Send verification code
    if (phone) {
      const sent = await sendSmsCode(phone, "reset_password", {
        ip: req.ip,
        headers: { "user-agent": req.get("User-Agent") || undefined },
      });

      if (!sent) {
        return res.status(429).send(
          error("Too many requests. Please try again later")
        );
      }
    } else if (email) {
      // Email sending deferred to Phase 3
      // For now, log a placeholder (in production, would send email)
      console.log(`[EMAIL DEV] Password reset requested for ${email}`);
      console.log(`[EMAIL DEV] In production, reset email would be sent here`);
    }

    // Create audit log (only if user exists)
    await createAuditLog(
      {
        userId: user.id,
        action: AuditActions.PASSWORD_RESET_REQUESTED,
        ipAddress: req.ip || null,
        userAgent: req.get("User-Agent") || null,
        metadata: { email, phone },
      },
      req
    );

    // Always return success to prevent user enumeration
    return res.status(200).send(
      success(null, "If an account exists, a reset code will be sent")
    );
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).send(error("Internal server error"));
  }
});

export default router;