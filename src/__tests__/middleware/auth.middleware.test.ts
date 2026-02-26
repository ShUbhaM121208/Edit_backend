import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { generateToken } from "../../utils/jwt.js";
import jwt from "jsonwebtoken";

// Helper to create mock req/res/next
function createMocks(authHeader?: string) {
  const req = {
    headers: authHeader !== undefined ? { authorization: authHeader } : {},
  } as unknown as Request;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  const next = vi.fn() as NextFunction;

  return { req, res, next };
}

describe("Auth Middleware — requireAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call next() for a valid Bearer token", () => {
    const token = generateToken({ userId: "user-1", phone: "9876543210" });
    const { req, res, next } = createMocks(`Bearer ${token}`);

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect((req as any).user.userId).toBe("user-1");
    expect((req as any).user.phone).toBe("9876543210");
  });

  it("should return 401 when Authorization header is missing", () => {
    const { req, res, next } = createMocks(undefined);

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 401 when Authorization header is empty string", () => {
    const { req, res, next } = createMocks("");

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 401 when Authorization header has no Bearer prefix", () => {
    const token = generateToken({ userId: "user-1", phone: "9876543210" });
    const { req, res, next } = createMocks(token); // no "Bearer " prefix

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 401 when Authorization is 'Basic' instead of 'Bearer'", () => {
    const { req, res, next } = createMocks("Basic abc123");

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 401 when Bearer token is missing after prefix", () => {
    const { req, res, next } = createMocks("Bearer ");

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 401 for an invalid/garbage token", () => {
    const { req, res, next } = createMocks("Bearer garbage.token.here");

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Invalid or expired token" })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 401 for a token signed with a different secret", () => {
    const badToken = jwt.sign({ userId: "user-1", phone: "9876543210" }, "wrong-secret");
    const { req, res, next } = createMocks(`Bearer ${badToken}`);

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 401 for an expired token", () => {
    const expiredToken = jwt.sign(
      { userId: "user-1", phone: "9876543210" },
      process.env.JWT_SECRET!,
      { expiresIn: "0s" }
    );
    const { req, res, next } = createMocks(`Bearer ${expiredToken}`);

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 401 for a tampered token", () => {
    const token = generateToken({ userId: "user-1", phone: "9876543210" });
    const parts = token.split(".");
    // Flip a character in the signature
    const sig = parts[2];
    parts[2] = sig[0] === "a" ? "b" + sig.slice(1) : "a" + sig.slice(1);
    const tampered = parts.join(".");

    const { req, res, next } = createMocks(`Bearer ${tampered}`);

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
