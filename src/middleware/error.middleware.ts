import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { OtpRateLimitError, OtpLockoutError } from "../services/otp.service.js";

/**
 * Global error handler — catches all unhandled errors.
 * Formats Zod validation errors into a clean response.
 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // Zod validation errors
  if (err instanceof ZodError) {
    const errors = err.errors.map((e) => ({
      field: e.path.join("."),
      message: e.message,
    }));

    res.status(400).json({
      success: false,
      message: "Validation error",
      errors,
    });
    return;
  }

  // OTP rate limit
  if (err instanceof OtpRateLimitError) {
    res.status(429).json({
      success: false,
      message: err.message,
    });
    return;
  }

  // OTP lockout (too many failed verify attempts)
  if (err instanceof OtpLockoutError) {
    res.status(429).json({
      success: false,
      message: err.message,
    });
    return;
  }

  // Known errors with message
  if (err instanceof Error) {
    console.error(`[Error] ${err.message}`, err.stack);

    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === "development" ? err.message : "Internal server error",
    });
    return;
  }

  // Unknown errors
  console.error("[Error] Unknown error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
}
