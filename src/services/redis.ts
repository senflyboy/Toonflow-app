/**
 * Redis service for token blacklist and caching
 * Supports Upstash Redis (serverless) - recommended for Vercel deployment
 * For local development without Redis, operations will gracefully fail
 */

import { Redis } from "@upstash/redis";

let redis: Redis | null = null;
let redisAvailable = false;

/**
 * Check if Redis is available
 */
export function isRedisAvailable(): boolean {
  return redisAvailable;
}

/**
 * Initialize Redis client
 * Uses Upstash for serverless environment
 * Falls back to disabled mode if not configured
 */
export function getRedis(): Redis {
  if (!redis) {
    // Try Upstash first (for Vercel/serverless)
    const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
    const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (upstashUrl && upstashToken) {
      redis = new Redis({
        url: upstashUrl,
        token: upstashToken,
      });
      redisAvailable = true;
      console.log("Using Upstash Redis for token blacklist");
    } else {
      // Redis not configured - create a mock that gracefully fails
      console.log("Redis not configured - token blacklist disabled (set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to enable)");
      redisAvailable = false;
      // Return a mock Redis that does nothing
      redis = new Redis({
        url: "https://placeholder.upstash.io",
        token: "placeholder",
      });
    }
  }
  return redis;
}

/**
 * Blacklist a token with TTL
 * @param token - The token to blacklist (hashed or raw)
 * @param ttlSeconds - Time to live in seconds (default: 7 days)
 */
export async function blacklistToken(token: string, ttlSeconds: number = 7 * 24 * 60 * 60): Promise<void> {
  const client = getRedis();
  const key = `blacklist:${token}`;

  await client.set(key, "1", { ex: ttlSeconds });
}

/**
 * Check if a token is blacklisted
 * @param token - The token to check (hashed or raw)
 * @returns true if token is blacklisted
 */
export async function isTokenBlacklisted(token: string): Promise<boolean> {
  const client = getRedis();
  const key = `blacklist:${token}`;

  const result = await client.get(key);
  return result !== null && result !== undefined;
}

/**
 * Remove a token from blacklist (for cleanup or unblacklist)
 * @param token - The token to remove from blacklist
 */
export async function deleteKey(key: string): Promise<void> {
  const client = getRedis();
  await client.del(key);
}

/**
 * Get remaining TTL for a blacklisted token
 * @param token - The token to check
 * @returns Remaining seconds, or -2 if key doesn't exist
 */
export async function getTokenTTL(token: string): Promise<number> {
  const client = getRedis();
  const key = `blacklist:${token}`;

  return await client.ttl(key);
}

export default {
  getRedis,
  isRedisAvailable,
  blacklistToken,
  isTokenBlacklisted,
  deleteKey,
  getTokenTTL,
};