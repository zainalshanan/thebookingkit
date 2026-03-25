/**
 * Shared URL validation utilities.
 *
 * Centralises HTTPS enforcement and SSRF prevention for any external URL
 * accepted from user input (webhook subscriber URLs, workflow webhook action URLs, etc.).
 */

/** Pattern that matches private/loopback hostnames blocked for SSRF prevention */
const SSRF_PATTERN =
  /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|\[::1\]|::1)$/;

/**
 * Validate that an external URL is safe to contact.
 *
 * Checks:
 * - URL is parseable
 * - Protocol is HTTPS
 * - Hostname is not a private/loopback address (SSRF prevention)
 *
 * @param url - The raw URL string to validate
 * @param fieldName - Human-readable field name used in error messages (e.g. "Subscriber URL")
 * @throws {Error} If the URL fails any validation check
 */
export function validateExternalUrl(url: string, fieldName: string): void {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`Invalid ${fieldName}: "${url}"`);
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error(`${fieldName} must use HTTPS`);
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (SSRF_PATTERN.test(hostname)) {
    throw new Error(`${fieldName} hostname is not allowed: "${hostname}"`);
  }
}
