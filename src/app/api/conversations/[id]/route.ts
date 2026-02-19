import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { TranscriptEntry } from "@/lib/types";

// ─── Inline Rate Limiter ────────────────────────────────────────────────────

const rateLimitStore = new Map<string, number[]>();
let rateLimitCallCount = 0;

function rateLimit(
  identifier: string,
  maxRequests: number,
  windowMs: number,
  namespace: string,
): { success: boolean; remaining: number } {
  const key = `${namespace}:${identifier}`;
  const now = Date.now();
  const timestamps = rateLimitStore.get(key) ?? [];

  // Remove expired entries
  const valid = timestamps.filter((t) => now - t < windowMs);

  // Periodic cleanup every 100 calls to prevent memory leaks
  rateLimitCallCount++;
  if (rateLimitCallCount % 100 === 0) {
    for (const [k, v] of rateLimitStore) {
      const filtered = v.filter((t) => now - t < windowMs);
      if (filtered.length === 0) {
        rateLimitStore.delete(k);
      } else {
        rateLimitStore.set(k, filtered);
      }
    }
  }

  if (valid.length >= maxRequests) {
    rateLimitStore.set(key, valid);
    return { success: false, remaining: 0 };
  }

  valid.push(now);
  rateLimitStore.set(key, valid);
  return { success: true, remaining: maxRequests - valid.length };
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Conversation ID must be 10-50 alphanumeric characters, hyphens, or underscores. */
const CONVERSATION_ID_PATTERN = /^[a-zA-Z0-9_-]{10,50}$/;

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // 1. Rate limit
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const { success } = rateLimit(ip, 200, 60_000, "conversations");
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment and try again." },
        { status: 429 },
      );
    }

    // 2. Await params (Next.js 16: params is a Promise) and validate ID format
    const { id } = await params;

    if (!CONVERSATION_ID_PATTERN.test(id)) {
      return NextResponse.json(
        { error: "Invalid conversation ID format" },
        { status: 400 },
      );
    }

    // 3. Check required environment variable
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      console.error("[conversations] ELEVENLABS_API_KEY is not configured");
      return NextResponse.json(
        { error: "Service configuration error" },
        { status: 500 },
      );
    }

    // 4. Fetch conversation from ElevenLabs REST API
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${id}`,
      {
        headers: {
          "xi-api-key": apiKey,
        },
      },
    );

    if (res.status === 404) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    if (!res.ok) {
      console.error(
        `[conversations] ElevenLabs API error: status=${res.status}, id=${id}`,
      );
      return NextResponse.json(
        { error: "Failed to fetch transcript" },
        { status: 500 },
      );
    }

    const data = await res.json();

    // 5. Map transcript when conversation is complete; otherwise signal not ready
    if (data.status === "done" || data.status === "finished") {
      const transcript: TranscriptEntry[] = (data.transcript || []).map(
        (entry: { role: string; message: string; time_in_call_secs?: number }) => ({
          role: entry.role === "agent" ? "agent" : "user",
          message: entry.message,
          timestamp: entry.time_in_call_secs,
        }),
      );

      return NextResponse.json(
        { ready: true, transcript },
        { status: 200 },
      );
    }

    // Conversation not yet ready -- client should retry with backoff
    return NextResponse.json(
      { ready: false },
      { status: 202 },
    );
  } catch (err) {
    console.error("[conversations] Unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to fetch transcript" },
      { status: 500 },
    );
  }
}
