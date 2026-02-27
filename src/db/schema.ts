export interface User {
  id: string;
  email: string | null;
  phone: string | null;
  password_hash: string;
  username: string | null;
  email_verified: boolean;
  phone_verified: boolean;
  failed_login_attempts: number;
  locked_until: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface RefreshToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
}

export interface SmsCode {
  id: string;
  phone: string;
  code: string;
  purpose: string;
  used: boolean;
  expires_at: Date;
  created_at: Date;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
}

export type { Knex } from "knex";