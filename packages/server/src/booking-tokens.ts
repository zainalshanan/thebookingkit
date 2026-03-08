import { createHmac } from "crypto";

/**
 * Generate a signed booking management token.
 *
 * The token is a signed payload containing the booking ID and expiry time.
 * It allows customers to view/manage their booking without authentication.
 *
 * @param bookingId - The booking UUID
 * @param expiresAt - When the token expires
 * @param secret - HMAC signing secret
 */
export function generateBookingToken(
  bookingId: string,
  expiresAt: Date,
  secret: string,
): string {
  const payload = `${bookingId}:${expiresAt.getTime()}`;
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("hex")
    .slice(0, 16);
  return Buffer.from(`${payload}:${signature}`).toString("base64url");
}

/**
 * Verify and decode a booking management token.
 *
 * @param token - The base64url-encoded token
 * @param secret - HMAC signing secret (must match generation)
 * @returns The booking ID if valid, null if invalid or expired
 */
export function verifyBookingToken(
  token: string,
  secret: string,
): { bookingId: string; expiresAt: Date } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8");
    const parts = decoded.split(":");
    if (parts.length !== 3) return null;

    const [bookingId, expiresAtStr, signature] = parts;
    const expiresAt = new Date(Number(expiresAtStr));

    // Check expiry
    if (expiresAt < new Date()) return null;

    // Verify signature
    const payload = `${bookingId}:${expiresAtStr}`;
    const expectedSig = createHmac("sha256", secret)
      .update(payload)
      .digest("hex")
      .slice(0, 16);

    if (signature !== expectedSig) return null;

    return { bookingId, expiresAt };
  } catch {
    return null;
  }
}
