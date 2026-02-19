import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

/** Compute HMAC-SHA256 of the site password using the session secret as key. */
function computeAuthToken(password: string): string {
  const key = process.env.SESSION_SECRET ?? password;
  return createHmac("sha256", key).update(password).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    const sitePassword = process.env.SITE_PASSWORD;

    if (!sitePassword || password !== sitePassword) {
      return NextResponse.json(
        { error: "Wrong password" },
        { status: 401 },
      );
    }

    const token = computeAuthToken(sitePassword);

    const res = NextResponse.json({ ok: true });
    res.cookies.set("site-auth", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return res;
  } catch (err) {
    console.error("[auth] Unexpected error:", err);
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500 },
    );
  }
}
