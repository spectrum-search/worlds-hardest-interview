import { NextRequest, NextResponse } from "next/server";

/** Convert a string to a Uint8Array using the TextEncoder API (Edge-compatible). */
function encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/** Convert an ArrayBuffer to a hex string. */
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Compute HMAC-SHA256 using the Web Crypto API (Edge Runtime compatible).
 * Returns the digest as a lowercase hex string.
 */
async function computeHmac(key: string, message: string): Promise<string> {
  const keyData = encode(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const msgData = encode(message);
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    msgData.buffer as ArrayBuffer,
  );
  return bufferToHex(signature);
}

/**
 * Timing-safe string comparison using the Web Crypto API.
 * Both strings must be the same length (guaranteed for hex-encoded SHA-256 digests).
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const aBytes = encode(a);
  const bBytes = encode(b);
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }
  return result === 0;
}

export async function middleware(req: NextRequest) {
  const sitePassword = process.env.SITE_PASSWORD;

  // If no password is configured, allow all access
  if (!sitePassword) return NextResponse.next();

  const cookieValue = req.cookies.get("site-auth")?.value;

  // Reject immediately if the cookie is missing or not a valid 64-char hex digest
  if (!cookieValue || !/^[a-f0-9]{64}$/.test(cookieValue)) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  // Recompute the expected HMAC token using Web Crypto API
  const key = process.env.SESSION_SECRET ?? sitePassword;
  const expectedToken = await computeHmac(key, sitePassword);

  // Timing-safe comparison to prevent timing attacks
  const authed = timingSafeEqual(cookieValue, expectedToken);

  if (authed) return NextResponse.next();

  // Redirect to login page
  const loginUrl = new URL("/login", req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Protect everything except:
     * - /login and /api/auth (the auth flow itself)
     * - _next, favicon, static assets
     */
    "/((?!login|api/auth|_next|favicon.ico|.*\\.).*)",
  ],
};
