import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

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

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // 1. Rate limit
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const { success } = rateLimit(ip, 100, 60_000, "upload");
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment and try again." },
        { status: 429 },
      );
    }

    // 2. Parse multipart form data and validate file presence
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 },
      );
    }

    // 3. Validate file extension
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (!ext || !["pdf", "docx", "txt"].includes(ext)) {
      return NextResponse.json(
        { error: "Only .pdf, .docx and .txt files are supported" },
        { status: 400 },
      );
    }

    // 4. Validate file size (under 10 MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File must be under 10 MB" },
        { status: 400 },
      );
    }

    // 5. Extract text from file based on format
    const buffer = Buffer.from(await file.arrayBuffer());
    let text: string;

    if (ext === "pdf") {
      // Import the inner lib directly to avoid pdf-parse's test-mode auto-run
      // (index.js tries to read a test PDF when !module.parent, which fails in bundlers)
      const pdfParseModule = await import("pdf-parse/lib/pdf-parse.js");
      const pdfParse = pdfParseModule.default ?? pdfParseModule;
      const result = await pdfParse(buffer);
      text = result.text;
    } else if (ext === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      text = buffer.toString("utf-8");
    }

    if (!text.trim()) {
      return NextResponse.json(
        { error: "Could not extract any text from the file" },
        { status: 422 },
      );
    }

    // 6. Return extracted text and original file name
    return NextResponse.json({ text, fileName: file.name });
  } catch (err) {
    console.error("[upload] Unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to process uploaded file" },
      { status: 500 },
    );
  }
}
