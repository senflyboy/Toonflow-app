import crypto from "crypto";
import { getPgDb } from "@/utils/dbPostgres";
import { createAuditLog, AuditActions } from "./audit";

const SMS_CODE_EXPIRY_MINUTES = 5;
const RESET_CODE_EXPIRY_MINUTES = 30;

/**
 * Generate a 6-digit verification code
 */
function generateCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Send SMS verification code
 * For development: if SMS provider not configured, log code to console
 *
 * @param phone - Phone number
 * @param purpose - Purpose of the code (e.g., 'register', 'reset_password', 'login')
 * @param auditReq - Optional request object for audit logging
 * @returns true if code was sent successfully
 */
export async function sendSmsCode(
  phone: string,
  purpose: string,
  auditReq?: { ip?: string; headers?: { "user-agent"?: string } }
): Promise<boolean> {
  const db = getPgDb();
  const code = generateCode();
  const expiresAt = new Date(Date.now() + SMS_CODE_EXPIRY_MINUTES * 60 * 1000);

  // Check if there's a recent code (rate limiting - 1 per minute)
  const recentCode = await db("sms_codes")
    .where("phone", phone)
    .where("purpose", purpose)
    .where("used", false)
    .where("expires_at", ">", new Date())
    .orderBy("created_at", "desc")
    .first();

  if (recentCode) {
    const timeSinceLastCode = Date.now() - new Date(recentCode.created_at).getTime();
    if (timeSinceLastCode < 60 * 1000) {
      // Less than 1 minute since last code
      console.log(`[SMS] Rate limited: ${phone} for ${purpose}`);
      return false;
    }
  }

  // Store code in database
  await db("sms_codes").insert({
    phone,
    code,
    purpose,
    used: false,
    expires_at: expiresAt,
  });

  // In development, log the code to console
  // In production, this would call an SMS provider API
  const smsProvider = process.env.SMS_PROVIDER;
  if (!smsProvider) {
    console.log(`[SMS DEV] Code for ${phone} (${purpose}): ${code}`);
    console.log(`[SMS DEV] Expires in ${SMS_CODE_EXPIRY_MINUTES} minutes`);
  } else {
    // TODO: Implement actual SMS provider integration (Aliyun, Tencent, etc.)
    console.log(`[SMS] Would send code ${code} to ${phone} via ${smsProvider}`);
  }

  // Create audit log
  await createAuditLog({
    userId: null,
    action: `sms_sent_${purpose}`,
    ipAddress: auditReq?.ip,
    userAgent: auditReq?.headers?.["user-agent"],
    metadata: { phone, purpose },
  });

  return true;
}

/**
 * Verify SMS code
 *
 * @param phone - Phone number
 * @param code - Verification code
 * @param purpose - Purpose of the code
 * @returns true if code is valid and not used
 */
export async function verifySmsCode(
  phone: string,
  code: string,
  purpose: string
): Promise<{ valid: boolean; error?: string }> {
  const db = getPgDb();

  // Find the code record
  const codeRecord = await db("sms_codes")
    .where("phone", phone)
    .where("code", code)
    .where("purpose", purpose)
    .where("used", false)
    .where("expires_at", ">", new Date())
    .orderBy("created_at", "desc")
    .first();

  if (!codeRecord) {
    return { valid: false, error: "Invalid or expired verification code" };
  }

  // Mark code as used
  await db("sms_codes").where("id", codeRecord.id).update({ used: true });

  return { valid: true };
}

/**
 * Request password reset code (sends SMS)
 *
 * @param phone - Phone number
 * @param auditReq - Optional request object for audit logging
 * @returns true if code was sent successfully
 */
export async function sendPasswordResetCode(
  phone: string,
  auditReq?: { ip?: string; headers?: { "user-agent"?: string } }
): Promise<boolean> {
  const db = getPgDb();
  const code = generateCode();
  const expiresAt = new Date(Date.now() + RESET_CODE_EXPIRY_MINUTES * 60 * 1000);

  // Check rate limiting (5 requests per hour per phone)
  const recentRequests = await db("sms_codes")
    .where("phone", phone)
    .where("purpose", "reset_password")
    .where("created_at", ">", new Date(Date.now() - 60 * 60 * 1000))
    .count("* as count")
    .first();

  if (recentRequests && Number(recentRequests.count) >= 5) {
    console.log(`[SMS] Rate limited password reset: ${phone}`);
    return false;
  }

  // Store code in database
  await db("sms_codes").insert({
    phone,
    code,
    purpose: "reset_password",
    used: false,
    expires_at: expiresAt,
  });

  // Log code (development) or send via SMS provider
  const smsProvider = process.env.SMS_PROVIDER;
  if (!smsProvider) {
    console.log(`[SMS DEV] Password reset code for ${phone}: ${code}`);
  } else {
    console.log(`[SMS] Would send password reset code ${code} to ${phone}`);
  }

  return true;
}