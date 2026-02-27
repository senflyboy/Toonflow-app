import express from "express";
import { z } from "zod";
import { getPgDb } from "@/utils/dbPostgres";
import { hashPassword, passwordSchema, emailSchema, phoneSchema, hashToken } from "@/utils/password";
import { success, error } from "@/lib/responseFormat";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

// Email registration schema
const emailRegisterSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  username: z.string().optional(),
});

// Phone registration schema
const phoneRegisterSchema = z.object({
  phone: phoneSchema,
  code: z.string().length(6, "SMS code must be 6 digits"),
  password: passwordSchema,
  username: z.string().optional(),
});

// POST /api/auth/register/email
router.post("/email", async (req, res) => {
  try {
    const validation = emailRegisterSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).send(error(validation.error.issues[0].message));
    }

    const { email, password, username } = validation.data;
    const db = getPgDb();

    // Check email uniqueness
    const existingUser = await db("users").where("email", email).first();
    if (existingUser) {
      return res.status(409).send(error("Email already registered"));
    }

    // Check username uniqueness if provided
    if (username) {
      const existingUsername = await db("users").where("username", username).first();
      if (existingUsername) {
        return res.status(409).send(error("Username already taken"));
      }
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const [user] = await db("users")
      .insert({
        email,
        username: username || null,
        password_hash: passwordHash,
        email_verified: false,
      })
      .returning(["id", "email", "username", "created_at"]);

    // Generate email verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await db("sms_codes").insert({
      id: uuidv4(),
      phone: email, // Use email as identifier
      code: verificationCode,
      purpose: "verify_email",
      expires_at: expiresAt,
      used: false,
    });

    // In development, log the verification code
    if (process.env.NODE_ENV !== "production") {
      console.log(`[DEV] Email verification code for ${email}: ${verificationCode}`);
    }

    // Create audit log
    await db("audit_logs").insert({
      user_id: user.id,
      action: "register_email",
      ip_address: req.ip || null,
      user_agent: req.get("User-Agent") || null,
      metadata: { email },
    });

    return res.status(201).send(
      success({
        userId: user.id,
        email: user.email,
        username: user.username,
      }, "Registration successful")
    );
  } catch (err) {
    console.error("Email registration error:", err);
    return res.status(500).send(error("Internal server error"));
  }
});

// POST /api/auth/register/phone
router.post("/phone", async (req, res) => {
  try {
    const validation = phoneRegisterSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).send(error(validation.error.issues[0].message));
    }

    const { phone, code, password, username } = validation.data;
    const db = getPgDb();

    // Verify SMS code
    const smsCode = await db("sms_codes")
      .where("phone", phone)
      .where("purpose", "register")
      .where("used", false)
      .where("expires_at", ">", new Date())
      .orderBy("created_at", "desc")
      .first();

    if (!smsCode) {
      return res.status(400).send(error("Invalid or expired SMS code"));
    }

    if (smsCode.code !== code) {
      return res.status(400).send(error("Invalid SMS code"));
    }

    // Mark code as used
    await db("sms_codes").where("id", smsCode.id).update({ used: true });

    // Check phone uniqueness
    const existingUser = await db("users").where("phone", phone).first();
    if (existingUser) {
      return res.status(409).send(error("Phone number already registered"));
    }

    // Check username uniqueness if provided
    if (username) {
      const existingUsername = await db("users").where("username", username).first();
      if (existingUsername) {
        return res.status(409).send(error("Username already taken"));
      }
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const [user] = await db("users")
      .insert({
        phone,
        username: username || null,
        password_hash: passwordHash,
        phone_verified: true,
      })
      .returning(["id", "phone", "username", "created_at"]);

    // Create audit log
    await db("audit_logs").insert({
      user_id: user.id,
      action: "register_phone",
      ip_address: req.ip || null,
      user_agent: req.get("User-Agent") || null,
      metadata: { phone },
    });

    return res.status(201).send(
      success({
        userId: user.id,
        phone: user.phone,
        username: user.username,
      }, "Registration successful")
    );
  } catch (err) {
    console.error("Phone registration error:", err);
    return res.status(500).send(error("Internal server error"));
  }
});

export default router;