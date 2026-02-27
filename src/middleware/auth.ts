import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getPgDb } from "@/utils/dbPostgres";
import { success, error } from "@/lib/responseFormat";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

export interface AuthUser {
  id: string;
  email?: string | null;
  phone?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * JWT Authentication middleware
 * Extracts Bearer token from Authorization header and verifies JWT
 * Attaches decoded user to req.user
 * Returns 401 if token missing/invalid/expired
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).send(error("Access token required"));
      return;
    }

    const token = authHeader.substring(7);

    if (!token) {
      res.status(401).send(error("Access token required"));
      return;
    }

    // Verify JWT token
    let decoded: jwt.JwtPayload;
    try {
      decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        res.status(401).send(error("Access token expired"));
        return;
      }
      if (err instanceof jwt.JsonWebTokenError) {
        res.status(401).send(error("Invalid access token"));
        return;
      }
      res.status(401).send(error("Authentication failed"));
      return;
    }

    // Extract user ID from token
    if (!decoded.sub) {
      res.status(401).send(error("Invalid token payload"));
      return;
    }

    // Verify user still exists in database
    const db = getPgDb();
    const user = await db("users").where("id", decoded.sub).first();

    if (!user) {
      res.status(401).send(error("User not found"));
      return;
    }

    // Attach user to request
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      phone: decoded.phone,
    };

    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    res.status(500).send(error("Authentication error"));
  }
}

/**
 * Optional authentication middleware
 * Same as authenticate but calls next() even if no token
 * If token is present and valid, attaches user to req.user
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      next();
      return;
    }

    const token = authHeader.substring(7);

    if (!token) {
      next();
      return;
    }

    // Verify JWT token
    let decoded: jwt.JwtPayload;
    try {
      decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    } catch {
      // Invalid token - continue without user
      next();
      return;
    }

    // Extract user ID from token
    if (!decoded.sub) {
      next();
      return;
    }

    // Verify user exists in database
    const db = getPgDb();
    const user = await db("users").where("id", decoded.sub).first();

    if (!user) {
      next();
      return;
    }

    // Attach user to request
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      phone: decoded.phone,
    };

    next();
  } catch (err) {
    console.error("Optional auth middleware error:", err);
    next();
  }
}