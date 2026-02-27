import { getPgDb } from "@/utils/dbPostgres";
import { Request } from "express";

export interface AuditLogInput {
  userId?: string | null;
  action: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Create an audit log entry
 * @param input - Audit log data
 * @param req - Express request object (optional, for extracting IP and user agent)
 */
export async function createAuditLog(
  input: AuditLogInput,
  req?: Request
): Promise<void> {
  try {
    const db = getPgDb();

    const logEntry = {
      user_id: input.userId || null,
      action: input.action,
      ip_address: input.ipAddress || (req?.ip ? req.ip : null),
      user_agent: input.userAgent || (req?.get("User-Agent") ? req.get("User-Agent") : null),
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    };

    await db("audit_logs").insert(logEntry);
  } catch (err) {
    // Log error but don't throw - audit logging should not break main flow
    console.error("Failed to create audit log:", err);
  }
}

/**
 * Get audit logs for a user
 * @param userId - User ID
 * @param limit - Maximum number of logs to return (default 50)
 */
export async function getUserAuditLogs(
  userId: string,
  limit: number = 50
): Promise<AuditLogInput[]> {
  const db = getPgDb();

  const logs = await db("audit_logs")
    .where("user_id", userId)
    .orderBy("created_at", "desc")
    .limit(limit);

  return logs.map((log) => ({
    userId: log.user_id,
    action: log.action,
    ipAddress: log.ip_address,
    userAgent: log.user_agent,
    metadata: log.metadata,
  }));
}

/**
 * Common audit actions
 */
export const AuditActions = {
  LOGIN_SUCCESS: "login_success",
  LOGIN_FAILED: "login_failed",
  LOGOUT: "logout",
  REGISTER: "register",
  PASSWORD_RESET_REQUESTED: "password_reset_requested",
  PASSWORD_RESET_COMPLETED: "password_reset_completed",
  PASSWORD_CHANGED: "password_changed",
  EMAIL_CHANGED: "email_changed",
  PHONE_CHANGED: "phone_changed",
  PROFILE_UPDATED: "profile_updated",
  TOKEN_REFRESHED: "token_refreshed",
  TOKEN_REVOKED: "token_revoked",
} as const;