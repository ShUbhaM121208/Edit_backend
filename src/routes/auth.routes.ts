import { Router } from "express";
import {
  handleSendOtp,
  handleVerifyOtp,
  handleGetMe,
  handleConnectInstagram,
  handleDisconnectInstagram,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

// Public routes
router.post("/send-otp", handleSendOtp);
router.post("/verify-otp", handleVerifyOtp);

// Protected routes
router.get("/me", requireAuth, handleGetMe);
router.post("/instagram/connect", requireAuth, handleConnectInstagram);
router.post("/instagram/disconnect", requireAuth, handleDisconnectInstagram);

export default router;
