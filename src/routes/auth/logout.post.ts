import express from "express";
import { z } from "zod";
import { getPgDb } from "@/utils/dbPostgres";
import { hashToken } from "@/utils/password";
import { success, error } from "@/lib/responseFormat";
import { createAuditLog, AuditActions } from "@/services/audit";
import { authenticate } from "@/middleware/auth";

const router = express.Router();

// Logout schema - refreshToken is optional
const logoutSchema = z.object({
  refreshToken: z.string().optional(),
});

/**
 * POST /api/auth/logout
 * Invalidate refresh token and log user out
 */
router.post("/", authenticate, async (req, res) => {
  try {
    const validation = logoutSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).send(error(validation.error.issues[0].message));
    }

    const { refreshToken } = validation.data;
    const db = getPgDb();
    const userId = req.user?.id;

    if (refreshToken && userId) {
      // Hash the refresh token and delete from database
      const tokenHash = hashToken(refreshToken);
      await db("refresh_tokens")
        .where("user_id", userId)
        .where("token_hash", tokenHash)
        .del();

      // Create audit log
      await createAuditLog(
        {
          userId,
          action: AuditActions.TOKEN_REVOKED,
          ipAddress: req.ip || null,
          userAgent: req.get("User-Agent") || null,
          metadata: { method: "logout" },
        },
        req
      );
    }

    // Create logout audit log
    if (userId) {
      await createAuditLog(
        {
          userId,
          action: AuditActions.LOGOUT,
          ipAddress: req.ip || null,
          userAgent: req.get("User-Agent") || null,
        },
        req
      );
    }

    return res.status(200).send(success(null, "Logged out successfully"));
  } catch (err) {
    console.error("Logout error:", err);
    return res.status(500).send(error("Internal server error"));
  }
});

export default router;