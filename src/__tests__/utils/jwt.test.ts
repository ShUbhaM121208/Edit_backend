import { describe, it, expect } from "vitest";
import { generateToken, verifyToken } from "../../utils/jwt.js";
import jwt from "jsonwebtoken";

describe("JWT Utils", () => {
  const payload = { userId: "test-user-id-123", phone: "9876543210" };

  describe("generateToken", () => {
    it("should return a string token", () => {
      const token = generateToken(payload);
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
    });

    it("should create a valid JWT with correct payload", () => {
      const token = generateToken(payload);
      const decoded = jwt.decode(token) as any;
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.phone).toBe(payload.phone);
    });

    it("should include an expiration claim", () => {
      const token = generateToken(payload);
      const decoded = jwt.decode(token) as any;
      expect(decoded.exp).toBeDefined();
      // Should expire ~7 days from now
      const sevenDaysFromNow = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
      expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
      expect(decoded.exp).toBeLessThanOrEqual(sevenDaysFromNow + 5); // 5s tolerance
    });

    it("should generate different tokens for different payloads", () => {
      const token1 = generateToken(payload);
      const token2 = generateToken({ userId: "other-id", phone: "1111111111" });
      expect(token1).not.toBe(token2);
    });
  });

  describe("verifyToken", () => {
    it("should return the payload for a valid token", () => {
      const token = generateToken(payload);
      const result = verifyToken(token);
      expect(result.userId).toBe(payload.userId);
      expect(result.phone).toBe(payload.phone);
    });

    it("should throw for an invalid token string", () => {
      expect(() => verifyToken("invalid-token-string")).toThrow();
    });

    it("should throw for a token with wrong secret", () => {
      const badToken = jwt.sign(payload, "wrong-secret", { expiresIn: "7d" });
      expect(() => verifyToken(badToken)).toThrow();
    });

    it("should throw for an expired token", () => {
      const expiredToken = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: "0s" });
      // Small delay to ensure expiry has passed
      expect(() => verifyToken(expiredToken)).toThrow();
    });

    it("should throw for an empty string", () => {
      expect(() => verifyToken("")).toThrow();
    });

    it("should throw for a tampered token (modified payload)", () => {
      const token = generateToken(payload);
      const parts = token.split(".");
      // Tamper the payload
      parts[1] = Buffer.from('{"userId":"hacker","phone":"0000000000"}').toString("base64url");
      const tampered = parts.join(".");
      expect(() => verifyToken(tampered)).toThrow();
    });
  });
});
