import bcrypt from "bcryptjs";
import { z } from "zod";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const emailSchema = z.string().email("Invalid email format");

export const phoneSchema = z.string().regex(/^1[3-9]\d{9}$/, "Invalid Chinese phone number format");

export function hashToken(token: string): string {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(token).digest("hex");
}