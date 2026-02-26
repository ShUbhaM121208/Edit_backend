import { prisma } from "../lib/prisma.js";
import { generateToken, verifyToken, type TokenPayload } from "../utils/jwt.js";

/**
 * Find user by phone or create a new one.
 * Used after OTP verification to ensure the user exists in DB.
 */
export async function findOrCreateUser(phone: string, countryCode: string) {
  let user = await prisma.user.findUnique({ where: { phone } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        phone,
        countryCode,
      },
    });
    console.log(`[Auth Service] New user created: ${user.id} (${countryCode}${phone})`);
  }

  return user;
}

/**
 * Update the user's Instagram connection status.
 */
export async function updateInstagramConnection(
  userId: string,
  connected: boolean,
  username?: string | null
) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      instagramConnected: connected,
      instagramUsername: connected ? (username ?? null) : null,
    },
    select: {
      id: true,
      phone: true,
      countryCode: true,
      name: true,
      instagramConnected: true,
      instagramUsername: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/**
 * Generate a JWT for the given user.
 */
export function createAuthToken(userId: string, phone: string): string {
  return generateToken({ userId, phone });
}

/**
 * Validate a JWT and return the payload.
 * Throws if the token is invalid or expired.
 */
export function validateAuthToken(token: string): TokenPayload {
  return verifyToken(token);
}

/**
 * Get user by ID — used by the /me endpoint.
 */
export async function getUserById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      phone: true,
      countryCode: true,
      name: true,
      instagramConnected: true,
      instagramUsername: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}
