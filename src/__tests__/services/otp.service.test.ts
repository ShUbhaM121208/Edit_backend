import { describe, it, expect, beforeEach } from "vitest";
import {
  sendOTP,
  verifyOTP,
  _clearOtpStores,
  _getOtpStoreEntry,
  OtpRateLimitError,
  OtpLockoutError,
} from "../../services/otp.service.js";

describe("OTP Service", () => {
  beforeEach(() => {
    _clearOtpStores();
  });

  // ──────────────────────────────────────
  // sendOTP
  // ──────────────────────────────────────

  describe("sendOTP", () => {
    it("should return success for a valid phone number", async () => {
      const result = await sendOTP("9876543210", "+91");
      expect(result.success).toBe(true);
    });

    it("should store the OTP in the internal store", async () => {
      await sendOTP("9876543210", "+91");
      const entry = _getOtpStoreEntry("9876543210");
      expect(entry).toBeDefined();
      expect(entry!.otp).toBe("123456");
    });

    it("should set an expiry time in the future", async () => {
      await sendOTP("9876543210", "+91");
      const entry = _getOtpStoreEntry("9876543210");
      expect(entry!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("should overwrite previous OTP when called again for the same phone", async () => {
      await sendOTP("9876543210", "+91");
      const entry1 = _getOtpStoreEntry("9876543210");
      const expiry1 = entry1!.expiresAt.getTime();

      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10));

      await sendOTP("9876543210", "+91");
      const entry2 = _getOtpStoreEntry("9876543210");
      expect(entry2!.expiresAt.getTime()).toBeGreaterThanOrEqual(expiry1);
    });

    it("should handle different country codes", async () => {
      const result = await sendOTP("1234567890", "+1");
      expect(result.success).toBe(true);
    });

    it("should rate limit after MAX_OTP_ATTEMPTS (5) requests", async () => {
      // Send 5 OTPs (should succeed)
      for (let i = 0; i < 5; i++) {
        await sendOTP("9876543210", "+91");
      }

      // 6th should throw rate limit error
      await expect(sendOTP("9876543210", "+91")).rejects.toThrow(OtpRateLimitError);
    });

    it("should rate limit per phone number (different phones have separate limits)", async () => {
      for (let i = 0; i < 5; i++) {
        await sendOTP("9876543210", "+91");
      }

      // Different phone should still work
      const result = await sendOTP("1111111111", "+91");
      expect(result.success).toBe(true);
    });
  });

  // ──────────────────────────────────────
  // verifyOTP
  // ──────────────────────────────────────

  describe("verifyOTP", () => {
    it("should return valid for correct OTP", async () => {
      await sendOTP("9876543210", "+91");
      const result = await verifyOTP("9876543210", "123456");
      expect(result.valid).toBe(true);
    });

    it("should return invalid for wrong OTP", async () => {
      await sendOTP("9876543210", "+91");
      const result = await verifyOTP("9876543210", "000000");
      expect(result.valid).toBe(false);
    });

    it("should return invalid when no OTP was requested for the phone", async () => {
      const result = await verifyOTP("9999999999", "123456");
      expect(result.valid).toBe(false);
    });

    it("should return invalid for expired OTP", async () => {
      await sendOTP("9876543210", "+91");

      // Manually expire the OTP
      const entry = _getOtpStoreEntry("9876543210");
      entry!.expiresAt = new Date(Date.now() - 1000); // 1 second in the past

      const result = await verifyOTP("9876543210", "123456");
      expect(result.valid).toBe(false);
    });

    it("should invalidate OTP after successful verification (single-use)", async () => {
      await sendOTP("9876543210", "+91");

      // First verify — should succeed
      const result1 = await verifyOTP("9876543210", "123456");
      expect(result1.valid).toBe(true);

      // Second verify — should fail (OTP already consumed)
      const result2 = await verifyOTP("9876543210", "123456");
      expect(result2.valid).toBe(false);
    });

    it("should clean up expired OTP from store", async () => {
      await sendOTP("9876543210", "+91");
      const entry = _getOtpStoreEntry("9876543210");
      entry!.expiresAt = new Date(Date.now() - 1000);

      await verifyOTP("9876543210", "123456");

      // Store should be cleaned up
      expect(_getOtpStoreEntry("9876543210")).toBeUndefined();
    });

    it("should track failed attempts and lockout after MAX_VERIFY_ATTEMPTS (5)", async () => {
      await sendOTP("9876543210", "+91");

      // 5 wrong attempts
      for (let i = 0; i < 5; i++) {
        const result = await verifyOTP("9876543210", "000000");
        expect(result.valid).toBe(false);
      }

      // 6th attempt should throw lockout
      await expect(verifyOTP("9876543210", "123456")).rejects.toThrow(OtpLockoutError);
    });

    it("should reset failed attempts when a new OTP is sent", async () => {
      await sendOTP("9876543210", "+91");

      // 3 wrong attempts
      for (let i = 0; i < 3; i++) {
        await verifyOTP("9876543210", "000000");
      }

      // Re-send OTP — should reset attempts
      await sendOTP("9876543210", "+91");

      // Should succeed now
      const result = await verifyOTP("9876543210", "123456");
      expect(result.valid).toBe(true);
    });

    it("should handle empty OTP string", async () => {
      await sendOTP("9876543210", "+91");
      const result = await verifyOTP("9876543210", "");
      expect(result.valid).toBe(false);
    });

    it("should handle partial OTP (less than 6 digits)", async () => {
      await sendOTP("9876543210", "+91");
      const result = await verifyOTP("9876543210", "123");
      expect(result.valid).toBe(false);
    });

    it("should handle OTP with extra digits", async () => {
      await sendOTP("9876543210", "+91");
      const result = await verifyOTP("9876543210", "1234567");
      expect(result.valid).toBe(false);
    });
  });
});
