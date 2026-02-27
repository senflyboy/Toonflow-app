import express from "express";
import { getPgDb } from "@/utils/dbPostgres";
import { success, error } from "@/lib/responseFormat";
import { authenticate } from "@/middleware/auth";

const router = express.Router();

/**
 * GET /api/user/profile
 * Get current user's profile
 */
router.get("/", authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).send(error("Unauthorized"));
    }

    const db = getPgDb();
    const user = await db("users")
      .where("id", userId)
      .select(
        "id",
        "email",
        "phone",
        "username",
        "email_verified",
        "phone_verified",
        "created_at",
        "updated_at"
      )
      .first();

    if (!user) {
      return res.status(404).send(error("User not found"));
    }

    return res.status(200).send(success(user, "Profile retrieved successfully"));
  } catch (err) {
    console.error("Get profile error:", err);
    return res.status(500).send(error("Internal server error"));
  }
});

export default router;