import { Router } from "express";
import { handleSendOtp, handleVerifyOtp, handleGetMe } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

// Public routes
router.post("/send-otp", handleSendOtp);
router.post("/verify-otp", handleVerifyOtp);

// Protected routes
router.get("/me", requireAuth, handleGetMe);

export default router;
