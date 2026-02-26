import type { Request, Response, NextFunction } from "express";
import { sendOtpSchema, verifyOtpSchema } from "../validators/auth.validators.js";
import { sendOTP, verifyOTP } from "../services/otp.service.js";
import {
  findOrCreateUser,
  createAuthToken,
  getUserById,
} from "../services/auth.service.js";

/**
 * POST /api/auth/send-otp
 * Body: { phone: string, countryCode?: string }
 */
export async function handleSendOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const data = sendOtpSchema.parse(req.body);
    const result = await sendOTP(data.phone, data.countryCode);

    res.json({
      success: result.success,
      message: "OTP sent successfully",
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/auth/verify-otp
 * Body: { phone: string, countryCode?: string, otp: string }
 */
export async function handleVerifyOtp(req: Request, res: Response, next: NextFunction) {
  try {
    const data = verifyOtpSchema.parse(req.body);
    const result = await verifyOTP(data.phone, data.otp);

    if (!result.valid) {
      res.status(401).json({
        success: false,
        message: "Invalid or expired OTP",
      });
      return;
    }

    // OTP valid — find or create user
    const user = await findOrCreateUser(data.phone, data.countryCode);
    const token = createAuthToken(user.id, user.phone);

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        phone: user.phone,
        countryCode: user.countryCode,
        name: user.name,
        instagramConnected: user.instagramConnected,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/auth/me
 * Protected — requires valid JWT in Authorization header
 */
export async function handleGetMe(req: Request, res: Response, next: NextFunction) {
  try {
    // req.user is attached by auth middleware
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const user = await getUserById(userId);
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    res.json({ success: true, user });
  } catch (error) {
    next(error);
  }
}
