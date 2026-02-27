import express from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { getPgDb } from "@/utils/dbPostgres";
import { verifyPassword, passwordSchema, emailSchema, hashToken } from "@/utils/password";
import { success, error } from "@/lib/responseFormat";

const router = express.Router();

// Login schema - either email or phone required
const loginSchema = z.object({
  email: emailSchema.optional(),
  phone: z.string().regex(/^1[3-9]\d{9}$/, "Invalid phone number").optional(),
  password: passwordSchema,
}).refine((data) => data.email || data.phone, {
  message: "Either email or phone is required",
  path: ["email"],
});

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || "15m";
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || "7d";
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 30;

type SignOptions = Parameters<typeof jwt.sign>[2];

// POST /api/auth/login
router.post("/", async (req, res) => {
  try {
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).send(error(validation.error.issues[0].message));
    }

    const { email, phone, password } = validation.data;
    const db = getPgDb();

    // Find user by email or phone
    let user;
    if (email) {
      user = await db("users").where("email", email).first();
    } else if (phone) {
      user = await db("users").where("phone", phone).first();
    }

    // Generic error message to prevent user enumeration
    const genericErrorMessage = "Invalid email/phone or password";

    if (!user) {
      return res.status(401).send(error(genericErrorMessage));
    }

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const lockTime = new Date(user.locked_until);
      const minutesLeft = Math.ceil((lockTime.getTime() - Date.now()) / 60000);
      return res.status(403).send(error(`Account locked. Try again in ${minutesLeft} minutes`));
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      // Increment failed login attempts
      const newAttempts = user.failed_login_attempts + 1;
      let updateData: Record<string, unknown> = {
        failed_login_attempts: newAttempts,
      };

      // Lock account if max attempts reached
      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000);
        updateData.locked_until = lockedUntil;
      }

      await db("users").where("id", user.id).update(updateData);

      // Log failed attempt
      await db("audit_logs").insert({
        user_id: user.id,
        action: "login_failed",
        ip_address: req.ip || null,
        user_agent: req.get("User-Agent") || null,
        metadata: { email, phone, attempts: newAttempts },
      });

      return res.status(401).send(error(genericErrorMessage));
    }

    // Reset failed login attempts on successful login
    await db("users")
      .where("id", user.id)
      .update({
        failed_login_attempts: 0,
        locked_until: null,
      });

    // Generate access token
    const accessToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        phone: user.phone,
      },
      JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY } as SignOptions
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      {
        sub: user.id,
        type: "refresh",
      },
      JWT_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRY } as SignOptions
    );

    // Hash refresh token and store in database
    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db("refresh_tokens").insert({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    // Log successful login
    await db("audit_logs").insert({
      user_id: user.id,
      action: "login_success",
      ip_address: req.ip || null,
      user_agent: req.get("User-Agent") || null,
      metadata: { email, phone },
    });

    return res.status(200).send(
      success({
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          username: user.username,
        },
      }, "Login successful")
    );
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).send(error("Internal server error"));
  }
});

export default router;