import express from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { getPgDb } from "@/utils/dbPostgres";
import { hashToken } from "@/utils/password";
import { success, error } from "@/lib/responseFormat";
import { createAuditLog, AuditActions } from "@/services/audit";
import { isTokenBlacklisted } from "@/services/redis";

const router = express.Router();

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || "15m";
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || "7d";

// Refresh token schema
const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

type SignOptions = Parameters<typeof jwt.sign>[2];

/**
 * POST /api/auth/refresh
 * Exchange refresh token for new access token and refresh token
 */
router.post("/", async (req, res) => {
  try {
    const validation = refreshSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).send(error(validation.error.issues[0].message));
    }

    const { refreshToken } = validation.data;
    const db = getPgDb();

    // Verify the refresh token JWT
    let decoded: jwt.JwtPayload;
    try {
      decoded = jwt.verify(refreshToken, JWT_SECRET) as jwt.JwtPayload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        return res.status(401).send(error("Refresh token expired"));
      }
      if (err instanceof jwt.JsonWebTokenError) {
        return res.status(401).send(error("Invalid refresh token"));
      }
      return res.status(401).send(error("Token verification failed"));
    }

    // Check token type
    if (decoded.type !== "refresh") {
      return res.status(401).send(error("Invalid token type"));
    }

    // Extract user ID from token
    const userId = decoded.sub;
    if (!userId) {
      return res.status(401).send(error("Invalid token payload"));
    }

    // Hash the provided refresh token and look up in database
    const tokenHash = hashToken(refreshToken);

    // Check if token is blacklisted in Redis
    try {
      const isBlacklisted = await isTokenBlacklisted(tokenHash);
      if (isBlacklisted) {
        return res.status(401).send(error("Token has been revoked"));
      }
    } catch (redisErr) {
      console.error("Redis blacklist check failed:", redisErr);
      // Continue with DB check if Redis fails
    }

    const storedToken = await db("refresh_tokens")
      .where("user_id", userId)
      .where("token_hash", tokenHash)
      .where("expires_at", ">", new Date())
      .first();

    if (!storedToken) {
      // Token not found or expired - could be already used or invalid
      return res.status(401).send(error("Invalid or expired refresh token"));
    }

    // Get user details
    const user = await db("users").where("id", userId).first();
    if (!user) {
      return res.status(401).send(error("User not found"));
    }

    // Revoke old refresh token (delete from DB)
    await db("refresh_tokens").where("id", storedToken.id).del();

    // Generate new access token (15 minutes)
    const newAccessToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        phone: user.phone,
      },
      JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY } as SignOptions
    );

    // Generate new refresh token (7 days)
    const newRefreshToken = jwt.sign(
      {
        sub: user.id,
        type: "refresh",
      },
      JWT_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRY } as SignOptions
    );

    // Store new refresh token hash
    const newTokenHash = hashToken(newRefreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db("refresh_tokens").insert({
      user_id: user.id,
      token_hash: newTokenHash,
      expires_at: expiresAt,
    });

    // Create audit log for token refresh
    await createAuditLog(
      {
        userId: user.id,
        action: AuditActions.TOKEN_REFRESHED,
        ipAddress: req.ip || null,
        userAgent: req.get("User-Agent") || null,
        metadata: { method: "refresh_token" },
      },
      req
    );

    return res.status(200).send(
      success(
        {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        },
        "Token refreshed successfully"
      )
    );
  } catch (err) {
    console.error("Token refresh error:", err);
    return res.status(500).send(error("Internal server error"));
  }
});

export default router;