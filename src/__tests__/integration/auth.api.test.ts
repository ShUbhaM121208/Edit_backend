import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../index.js";
import { _clearOtpStores } from "../../services/otp.service.js";
import { generateToken } from "../../utils/jwt.js";
import jwt from "jsonwebtoken";

// Mock Prisma to avoid needing a real database in tests
vi.mock("../../lib/prisma.js", () => {
  const mockUsers = new Map<string, any>();
  return {
    prisma: {
      user: {
        findUnique: vi.fn(({ where }: any) => {
          if (where.phone) return Promise.resolve(mockUsers.get(where.phone) || null);
          if (where.id) {
            for (const u of mockUsers.values()) {
              if (u.id === where.id) return Promise.resolve(u);
            }
            return Promise.resolve(null);
          }
          return Promise.resolve(null);
        }),
        create: vi.fn(({ data }: any) => {
          const user = {
            id: `mock-uuid-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            phone: data.phone,
            countryCode: data.countryCode || "+91",
            name: null,
            instagramConnected: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockUsers.set(data.phone, user);
          return Promise.resolve(user);
        }),
      },
      _mockUsers: mockUsers,
    },
  };
});

// Import mock after vi.mock
import { prisma } from "../../lib/prisma.js";

const app = createApp();

describe("Auth API — Integration Tests", () => {
  beforeEach(() => {
    _clearOtpStores();
    (prisma as any)._mockUsers.clear();
    vi.clearAllMocks();
  });

  // ──────────────────────────────────────
  // Health Check
  // ──────────────────────────────────────

  describe("GET /api/health", () => {
    it("should return 200 with status ok", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.timestamp).toBeDefined();
    });
  });

  // ──────────────────────────────────────
  // POST /api/auth/send-otp
  // ──────────────────────────────────────

  describe("POST /api/auth/send-otp", () => {
    it("should return 200 for valid phone number", async () => {
      const res = await request(app)
        .post("/api/auth/send-otp")
        .send({ phone: "9876543210", countryCode: "+91" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("OTP sent successfully");
    });

    it("should default countryCode to +91 if not provided", async () => {
      const res = await request(app)
        .post("/api/auth/send-otp")
        .send({ phone: "9876543210" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("should return 400 for missing phone", async () => {
      const res = await request(app)
        .post("/api/auth/send-otp")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Validation error");
      expect(res.body.errors).toBeDefined();
    });

    it("should return 400 for phone with letters", async () => {
      const res = await request(app)
        .post("/api/auth/send-otp")
        .send({ phone: "98765abcde" });

      expect(res.status).toBe(400);
      expect(res.body.errors.some((e: any) => e.field === "phone")).toBe(true);
    });

    it("should return 400 for phone too short", async () => {
      const res = await request(app)
        .post("/api/auth/send-otp")
        .send({ phone: "12345" });

      expect(res.status).toBe(400);
    });

    it("should return 400 for invalid country code", async () => {
      const res = await request(app)
        .post("/api/auth/send-otp")
        .send({ phone: "9876543210", countryCode: "91" });

      expect(res.status).toBe(400);
    });

    it("should return 400 for empty body (no JSON)", async () => {
      const res = await request(app)
        .post("/api/auth/send-otp")
        .send();

      expect(res.status).toBe(400);
    });

    it("should return 400 for phone as a number type", async () => {
      const res = await request(app)
        .post("/api/auth/send-otp")
        .send({ phone: 9876543210 });

      expect(res.status).toBe(400);
    });

    it("should return 429 after rate limit exceeded", async () => {
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post("/api/auth/send-otp")
          .send({ phone: "9876543210" });
      }

      const res = await request(app)
        .post("/api/auth/send-otp")
        .send({ phone: "9876543210" });

      expect(res.status).toBe(429);
      expect(res.body.success).toBe(false);
    });
  });

  // ──────────────────────────────────────
  // POST /api/auth/verify-otp
  // ──────────────────────────────────────

  describe("POST /api/auth/verify-otp", () => {
    it("should return 200 with token and user for correct OTP", async () => {
      await request(app)
        .post("/api/auth/send-otp")
        .send({ phone: "9876543210" });

      const res = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: "9876543210", otp: "123456" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(typeof res.body.token).toBe("string");
      expect(res.body.user).toBeDefined();
      expect(res.body.user.phone).toBe("9876543210");
      expect(res.body.user.id).toBeDefined();
    });

    it("should return 401 for wrong OTP", async () => {
      await request(app)
        .post("/api/auth/send-otp")
        .send({ phone: "9876543210" });

      const res = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: "9876543210", otp: "000000" });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Invalid or expired OTP");
    });

    it("should return 401 when OTP was never sent", async () => {
      const res = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: "9876543210", otp: "123456" });

      expect(res.status).toBe(401);
    });

    it("should return 401 when OTP is used twice (replay attack)", async () => {
      await request(app)
        .post("/api/auth/send-otp")
        .send({ phone: "9876543210" });

      // First use — should succeed
      const res1 = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: "9876543210", otp: "123456" });
      expect(res1.status).toBe(200);

      // Second use — should fail
      const res2 = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: "9876543210", otp: "123456" });
      expect(res2.status).toBe(401);
    });

    it("should return 400 for missing phone", async () => {
      const res = await request(app)
        .post("/api/auth/verify-otp")
        .send({ otp: "123456" });

      expect(res.status).toBe(400);
    });

    it("should return 400 for missing OTP", async () => {
      const res = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: "9876543210" });

      expect(res.status).toBe(400);
    });

    it("should return 400 for OTP with wrong length", async () => {
      const res = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: "9876543210", otp: "12345" });

      expect(res.status).toBe(400);
    });

    it("should return 400 for OTP with letters", async () => {
      const res = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: "9876543210", otp: "1234ab" });

      expect(res.status).toBe(400);
    });

    it("should return 400 for empty body", async () => {
      const res = await request(app)
        .post("/api/auth/verify-otp")
        .send();

      expect(res.status).toBe(400);
    });

    it("should create a new user on first login", async () => {
      await request(app)
        .post("/api/auth/send-otp")
        .send({ phone: "5555555555" });

      const res = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: "5555555555", otp: "123456" });

      expect(res.status).toBe(200);
      expect(res.body.user.phone).toBe("5555555555");
      expect(prisma.user.create).toHaveBeenCalled();
    });

    it("should return existing user on repeat login", async () => {
      // First login — creates user
      await request(app).post("/api/auth/send-otp").send({ phone: "5555555555" });
      await request(app).post("/api/auth/verify-otp").send({ phone: "5555555555", otp: "123456" });

      // Second login — finds existing
      await request(app).post("/api/auth/send-otp").send({ phone: "5555555555" });
      const res = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: "5555555555", otp: "123456" });

      expect(res.status).toBe(200);
      expect(res.body.user.phone).toBe("5555555555");
    });

    it("should return 429 after too many failed verify attempts", async () => {
      await request(app).post("/api/auth/send-otp").send({ phone: "9876543210" });

      // 5 wrong attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post("/api/auth/verify-otp")
          .send({ phone: "9876543210", otp: "000000" });
      }

      // 6th — should lockout
      const res = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: "9876543210", otp: "123456" });

      expect(res.status).toBe(429);
    });

    it("should return a valid JWT that contains user info", async () => {
      await request(app).post("/api/auth/send-otp").send({ phone: "9876543210" });

      const res = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: "9876543210", otp: "123456" });

      const decoded = jwt.decode(res.body.token) as any;
      expect(decoded).toBeDefined();
      expect(decoded.userId).toBe(res.body.user.id);
      expect(decoded.phone).toBe("9876543210");
      expect(decoded.exp).toBeDefined();
    });
  });

  // ──────────────────────────────────────
  // GET /api/auth/me
  // ──────────────────────────────────────

  describe("GET /api/auth/me", () => {
    it("should return 200 with user data for valid token", async () => {
      // Login first
      await request(app).post("/api/auth/send-otp").send({ phone: "9876543210" });
      const loginRes = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: "9876543210", otp: "123456" });

      const token = loginRes.body.token;

      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.phone).toBe("9876543210");
    });

    it("should return 401 without Authorization header", async () => {
      const res = await request(app).get("/api/auth/me");

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("should return 401 with empty Bearer token", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer ");

      expect(res.status).toBe(401);
    });

    it("should return 401 with invalid token", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalid.token.here");

      expect(res.status).toBe(401);
    });

    it("should return 401 with expired token", async () => {
      const expiredToken = jwt.sign(
        { userId: "test-id", phone: "9876543210" },
        process.env.JWT_SECRET!,
        { expiresIn: "0s" }
      );

      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
    });

    it("should return 401 with wrong auth type (Basic instead of Bearer)", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Basic abc123");

      expect(res.status).toBe(401);
    });

    it("should return 404 when token is valid but user was deleted from DB", async () => {
      // Create a token for a non-existent user
      const token = generateToken({ userId: "non-existent-uuid", phone: "0000000000" });

      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("User not found");
    });

    it("should return user fields without sensitive data", async () => {
      await request(app).post("/api/auth/send-otp").send({ phone: "9876543210" });
      const loginRes = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phone: "9876543210", otp: "123456" });

      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${loginRes.body.token}`);

      expect(res.body.user).toHaveProperty("id");
      expect(res.body.user).toHaveProperty("phone");
      expect(res.body.user).toHaveProperty("countryCode");
      expect(res.body.user).toHaveProperty("name");
      expect(res.body.user).toHaveProperty("instagramConnected");
      // Should not leak password hashes or internal fields
      expect(res.body.user).not.toHaveProperty("password");
    });
  });

  // ──────────────────────────────────────
  // 404 — Unknown routes
  // ──────────────────────────────────────

  describe("Unknown routes", () => {
    it("should return 404 for unknown route", async () => {
      const res = await request(app).get("/api/unknown");
      expect(res.status).toBe(404);
    });

    it("should return 404 for unknown auth sub-route", async () => {
      const res = await request(app).post("/api/auth/nonexistent");
      expect(res.status).toBe(404);
    });
  });

  // ──────────────────────────────────────
  // Content-Type edge cases
  // ──────────────────────────────────────

  describe("Content-Type edge cases", () => {
    it("should handle request with wrong content type gracefully", async () => {
      const res = await request(app)
        .post("/api/auth/send-otp")
        .set("Content-Type", "text/plain")
        .send("not json");

      // Should either be 400 (validation error on empty body) or similar
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });
});
