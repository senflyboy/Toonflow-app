import rateLimit from "express-rate-limit";

/**
 * General API rate limiter
 * 100 requests per 15 minutes per IP
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please try again later" },
  keyGenerator: (req) => {
    // Use X-Forwarded-For if behind proxy, otherwise use IP
    return req.headers["x-forwarded-for"] as string || req.ip || "unknown";
  },
});

/**
 * Auth endpoints rate limiter
 * 20 requests per 15 minutes per IP
 * Applied to /api/auth/* routes
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many authentication attempts, please try again later" },
  keyGenerator: (req) => {
    return req.headers["x-forwarded-for"] as string || req.ip || "unknown";
  },
});

/**
 * SMS sending rate limiter
 * 10 requests per hour per phone number
 * Applied when sending SMS verification codes
 */
export const smsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many SMS requests, please try again later" },
  keyGenerator: (req) => {
    // Use phone number if available, otherwise use IP
    const phone = req.body?.phone;
    if (phone) {
      return phone;
    }
    return req.headers["x-forwarded-for"] as string || req.ip || "unknown";
  },
});

/**
 * Strict rate limiter for password reset
 * 5 requests per hour per IP
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many password reset attempts, please try again later" },
  keyGenerator: (req) => {
    return req.headers["x-forwarded-for"] as string || req.ip || "unknown";
  },
});