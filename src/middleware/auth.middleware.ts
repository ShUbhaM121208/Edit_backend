import type { Request, Response, NextFunction } from "express";
import { validateAuthToken } from "../services/auth.service.js";

/**
 * Auth middleware — extracts JWT from Authorization header,
 * verifies it, and attaches user payload to req.user.
 *
 * Usage: router.get("/protected", requireAuth, handler);
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        message: "Missing or invalid Authorization header",
      });
      return;
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      res.status(401).json({
        success: false,
        message: "Missing token",
      });
      return;
    }

    const payload = validateAuthToken(token);

    // Attach user info to the request object
    req.user = payload;

    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
}
