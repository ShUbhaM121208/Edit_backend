import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { errorHandler } from "../../middleware/error.middleware.js";
import { OtpRateLimitError, OtpLockoutError } from "../../services/otp.service.js";

function createMocks() {
  const req = {} as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

describe("Error Middleware — errorHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should format ZodError as 400 with field-level errors", () => {
    const { req, res, next } = createMocks();
    const zodError = new ZodError([
      {
        code: "too_small",
        minimum: 10,
        type: "string",
        inclusive: true,
        exact: false,
        message: "Phone number must be at least 10 digits",
        path: ["phone"],
      },
    ]);

    errorHandler(zodError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "Validation error",
        errors: [{ field: "phone", message: "Phone number must be at least 10 digits" }],
      })
    );
  });

  it("should format ZodError with nested path correctly", () => {
    const { req, res, next } = createMocks();
    const zodError = new ZodError([
      {
        code: "invalid_type",
        expected: "string",
        received: "number",
        message: "Expected string, received number",
        path: ["body", "phone"],
      },
    ]);

    errorHandler(zodError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const response = (res.json as any).mock.calls[0][0];
    expect(response.errors[0].field).toBe("body.phone");
  });

  it("should return 429 for OtpRateLimitError", () => {
    const { req, res, next } = createMocks();
    const err = new OtpRateLimitError("Too many OTP requests. Please try again later.");

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "Too many OTP requests. Please try again later.",
      })
    );
  });

  it("should return 429 for OtpLockoutError", () => {
    const { req, res, next } = createMocks();
    const err = new OtpLockoutError("Too many failed attempts. Please request a new OTP.");

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "Too many failed attempts. Please request a new OTP.",
      })
    );
  });

  it("should return 500 for generic Error in development", () => {
    const { req, res, next } = createMocks();
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    errorHandler(new Error("Something broke"), req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "Something broke",
      })
    );

    process.env.NODE_ENV = originalEnv;
  });

  it("should return generic 500 message in production", () => {
    const { req, res, next } = createMocks();
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    errorHandler(new Error("DB connection failed"), req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "Internal server error",
      })
    );

    process.env.NODE_ENV = originalEnv;
  });

  it("should return 500 for unknown non-Error objects", () => {
    const { req, res, next } = createMocks();

    errorHandler("string error", req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "Internal server error",
      })
    );
  });

  it("should return 500 for null error", () => {
    const { req, res, next } = createMocks();

    errorHandler(null, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("should handle ZodError with multiple field errors", () => {
    const { req, res, next } = createMocks();
    const zodError = new ZodError([
      {
        code: "too_small",
        minimum: 10,
        type: "string",
        inclusive: true,
        exact: false,
        message: "Phone too short",
        path: ["phone"],
      },
      {
        code: "invalid_string",
        validation: "regex",
        message: "Invalid country code",
        path: ["countryCode"],
      },
    ]);

    errorHandler(zodError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const response = (res.json as any).mock.calls[0][0];
    expect(response.errors).toHaveLength(2);
    expect(response.errors[0].field).toBe("phone");
    expect(response.errors[1].field).toBe("countryCode");
  });
});
