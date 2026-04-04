/**
 * Shared URL validation utilities.
 *
 * Centralises HTTPS enforcement and SSRF prevention for any external URL
 * accepted from user input (webhook subscriber URLs, workflow webhook action URLs, etc.).
 */

/** Pattern that matches private/loopback hostnames blocked for SSRF prevention */
const SSRF_PATTERN =
  /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|\[::1\]|::1|\[::ffff:127\.\d+\.\d+\.\d+\]|\[::ffff:10\.\d+\.\d+\.\d+\]|\[::ffff:192\.168\.\d+\.\d+\]|\[fc[0-9a-f]{2}:.*\]|\[fd[0-9a-f]{2}:.*\])$/i;

/**
 * Check if a hostname is an IPv4-mapped IPv6 address pointing to a private range.
 * URL parser converts `::ffff:192.168.1.1` to hex form `::ffff:c0a8:101`,
 * so we need to decode the hex octets back to IPv4 and re-check.
 */
function isPrivateIPv4MappedIPv6(hostname: string): boolean {
  // Match [::ffff:XXXX:XXXX] hex form
  const match = hostname.match(/^\[::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})\]$/i);
  if (!match) return false;

  const hi = parseInt(match[1], 16);
  const lo = parseInt(match[2], 16);
  const a = (hi >> 8) & 0xff;
  const b = hi & 0xff;
  const c = (lo >> 8) & 0xff;
  const d = lo & 0xff;

  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 127.0.0.0/8
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local)
  if (a === 169 && b === 254) return true;

  return false;
}

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
  if (SSRF_PATTERN.test(hostname) || isPrivateIPv4MappedIPv6(hostname)) {
    throw new Error(`${fieldName} hostname is not allowed: "${hostname}"`);
  }
}
