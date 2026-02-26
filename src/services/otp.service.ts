/**
 * OTP Service — Mock implementation for development.
 *
 * In development mode, any phone number will receive a "successful" OTP send,
 * and the OTP is always "123456".
 *
 * To swap in a real provider (Twilio, MSG91, etc.), replace the implementations
 * of sendOTP() and verifyOTP() — no controller changes needed.
 */

// In-memory OTP store: phone → { otp, expiresAt }
const otpStore = new Map<string, { otp: string; expiresAt: Date }>();

// Rate limit store: phone → { count, windowStart }
const rateLimitStore = new Map<string, { count: number; windowStart: Date }>();

const DEV_OTP = "123456";
const OTP_EXPIRY_MINUTES = 5;
const MAX_OTP_ATTEMPTS = 5; // max OTP sends per phone per window
const RATE_LIMIT_WINDOW_MINUTES = 15;
const MAX_VERIFY_ATTEMPTS = 5; // max wrong verify attempts before lockout

// Track failed verification attempts: phone → count
const verifyAttemptStore = new Map<string, number>();

export async function sendOTP(phone: string, _countryCode: string): Promise<{ success: boolean }> {
  // Rate limiting: max N OTP sends per phone per window
  const now = new Date();
  const rateEntry = rateLimitStore.get(phone);

  if (rateEntry) {
    const windowEnd = new Date(rateEntry.windowStart.getTime() + RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);
    if (now < windowEnd) {
      if (rateEntry.count >= MAX_OTP_ATTEMPTS) {
        throw new OtpRateLimitError("Too many OTP requests. Please try again later.");
      }
      rateEntry.count++;
    } else {
      // Window expired, reset
      rateLimitStore.set(phone, { count: 1, windowStart: now });
    }
  } else {
    rateLimitStore.set(phone, { count: 1, windowStart: now });
  }

  // In production, call Twilio/MSG91 here
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  otpStore.set(phone, { otp: DEV_OTP, expiresAt });

  // Reset failed verify attempts when a new OTP is sent
  verifyAttemptStore.delete(phone);

  console.log(`[OTP Service] Mock OTP "${DEV_OTP}" sent to ${_countryCode}${phone} (expires: ${expiresAt.toISOString()})`);

  return { success: true };
}

export async function verifyOTP(phone: string, otp: string): Promise<{ valid: boolean }> {
  // Check lockout from too many failed attempts
  const attempts = verifyAttemptStore.get(phone) || 0;
  if (attempts >= MAX_VERIFY_ATTEMPTS) {
    // Clear the OTP entirely — force re-send
    otpStore.delete(phone);
    verifyAttemptStore.delete(phone);
    throw new OtpLockoutError("Too many failed attempts. Please request a new OTP.");
  }

  const stored = otpStore.get(phone);

  // No OTP was requested for this phone
  if (!stored) {
    return { valid: false };
  }

  // OTP expired
  if (new Date() > stored.expiresAt) {
    otpStore.delete(phone);
    return { valid: false };
  }

  // OTP mismatch — track failed attempt
  if (stored.otp !== otp) {
    verifyAttemptStore.set(phone, attempts + 1);
    return { valid: false };
  }

  // Valid — clean up
  otpStore.delete(phone);
  verifyAttemptStore.delete(phone);
  return { valid: true };
}

/**
 * Clear all OTP stores — used in testing only.
 */
export function _clearOtpStores() {
  otpStore.clear();
  rateLimitStore.clear();
  verifyAttemptStore.clear();
}

/**
 * Get the internal OTP store entry — used in testing only.
 */
export function _getOtpStoreEntry(phone: string) {
  return otpStore.get(phone);
}

// ──────────────────────────────────────
// Custom Error Classes
// ──────────────────────────────────────

export class OtpRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OtpRateLimitError";
  }
}

export class OtpLockoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OtpLockoutError";
  }
}
