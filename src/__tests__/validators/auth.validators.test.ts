import { describe, it, expect } from "vitest";
import { sendOtpSchema, verifyOtpSchema } from "../../validators/auth.validators.js";

describe("Auth Validators", () => {
  // ──────────────────────────────────────
  // sendOtpSchema
  // ──────────────────────────────────────

  describe("sendOtpSchema", () => {
    it("should accept valid phone with default country code", () => {
      const result = sendOtpSchema.parse({ phone: "9876543210" });
      expect(result.phone).toBe("9876543210");
      expect(result.countryCode).toBe("+91");
    });

    it("should accept valid phone with explicit country code", () => {
      const result = sendOtpSchema.parse({ phone: "9876543210", countryCode: "+1" });
      expect(result.countryCode).toBe("+1");
    });

    it("should accept 15-digit phone number (international)", () => {
      const result = sendOtpSchema.parse({ phone: "123456789012345" });
      expect(result.phone).toBe("123456789012345");
    });

    it("should reject phone shorter than 10 digits", () => {
      expect(() => sendOtpSchema.parse({ phone: "12345" })).toThrow();
    });

    it("should reject phone longer than 15 digits", () => {
      expect(() => sendOtpSchema.parse({ phone: "1234567890123456" })).toThrow();
    });

    it("should reject phone with letters", () => {
      expect(() => sendOtpSchema.parse({ phone: "98765abcde" })).toThrow();
    });

    it("should reject phone with special characters", () => {
      expect(() => sendOtpSchema.parse({ phone: "987-654-3210" })).toThrow();
    });

    it("should reject phone with spaces", () => {
      expect(() => sendOtpSchema.parse({ phone: "987 654 3210" })).toThrow();
    });

    it("should reject empty phone string", () => {
      expect(() => sendOtpSchema.parse({ phone: "" })).toThrow();
    });

    it("should reject missing phone field", () => {
      expect(() => sendOtpSchema.parse({})).toThrow();
    });

    it("should reject country code without +", () => {
      expect(() => sendOtpSchema.parse({ phone: "9876543210", countryCode: "91" })).toThrow();
    });

    it("should reject country code with letters", () => {
      expect(() => sendOtpSchema.parse({ phone: "9876543210", countryCode: "+AB" })).toThrow();
    });

    it("should reject country code that's too long", () => {
      expect(() => sendOtpSchema.parse({ phone: "9876543210", countryCode: "+12345" })).toThrow();
    });

    it("should reject empty country code", () => {
      expect(() => sendOtpSchema.parse({ phone: "9876543210", countryCode: "" })).toThrow();
    });

    it("should reject just the + sign as country code", () => {
      expect(() => sendOtpSchema.parse({ phone: "9876543210", countryCode: "+" })).toThrow();
    });

    it("should accept country codes with 1-4 digits", () => {
      expect(sendOtpSchema.parse({ phone: "9876543210", countryCode: "+1" }).countryCode).toBe("+1");
      expect(sendOtpSchema.parse({ phone: "9876543210", countryCode: "+91" }).countryCode).toBe("+91");
      expect(sendOtpSchema.parse({ phone: "9876543210", countryCode: "+354" }).countryCode).toBe("+354");
      expect(sendOtpSchema.parse({ phone: "9876543210", countryCode: "+1234" }).countryCode).toBe("+1234");
    });

    it("should reject non-string phone (number type)", () => {
      expect(() => sendOtpSchema.parse({ phone: 9876543210 })).toThrow();
    });

    it("should reject null body", () => {
      expect(() => sendOtpSchema.parse(null)).toThrow();
    });

    it("should reject undefined body", () => {
      expect(() => sendOtpSchema.parse(undefined)).toThrow();
    });
  });

  // ──────────────────────────────────────
  // verifyOtpSchema
  // ──────────────────────────────────────

  describe("verifyOtpSchema", () => {
    it("should accept valid phone + OTP with default country code", () => {
      const result = verifyOtpSchema.parse({ phone: "9876543210", otp: "123456" });
      expect(result.phone).toBe("9876543210");
      expect(result.otp).toBe("123456");
      expect(result.countryCode).toBe("+91");
    });

    it("should accept valid phone + OTP + explicit country code", () => {
      const result = verifyOtpSchema.parse({ phone: "9876543210", otp: "123456", countryCode: "+44" });
      expect(result.countryCode).toBe("+44");
    });

    it("should reject OTP shorter than 6 digits", () => {
      expect(() => verifyOtpSchema.parse({ phone: "9876543210", otp: "12345" })).toThrow();
    });

    it("should reject OTP longer than 6 digits", () => {
      expect(() => verifyOtpSchema.parse({ phone: "9876543210", otp: "1234567" })).toThrow();
    });

    it("should reject OTP with letters", () => {
      expect(() => verifyOtpSchema.parse({ phone: "9876543210", otp: "12345a" })).toThrow();
    });

    it("should reject OTP with special characters", () => {
      expect(() => verifyOtpSchema.parse({ phone: "9876543210", otp: "123-56" })).toThrow();
    });

    it("should reject empty OTP", () => {
      expect(() => verifyOtpSchema.parse({ phone: "9876543210", otp: "" })).toThrow();
    });

    it("should reject missing OTP field", () => {
      expect(() => verifyOtpSchema.parse({ phone: "9876543210" })).toThrow();
    });

    it("should reject missing phone field", () => {
      expect(() => verifyOtpSchema.parse({ otp: "123456" })).toThrow();
    });

    it("should reject empty body", () => {
      expect(() => verifyOtpSchema.parse({})).toThrow();
    });

    it("should reject OTP with spaces", () => {
      expect(() => verifyOtpSchema.parse({ phone: "9876543210", otp: "123 56" })).toThrow();
    });

    it("should reject non-string OTP", () => {
      expect(() => verifyOtpSchema.parse({ phone: "9876543210", otp: 123456 })).toThrow();
    });
  });
});
