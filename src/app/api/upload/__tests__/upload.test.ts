/**
 * Unit tests for the POST /api/upload route handler.
 *
 * Tests the file upload and text extraction endpoint that accepts PDF, DOCX,
 * and TXT files, validates them, and returns extracted text with the original
 * file name.
 *
 * Mocking strategy:
 * - pdf-parse/lib/pdf-parse.js is mocked -- it is an external I/O dependency
 *   that reads binary file data.
 * - mammoth is mocked -- it is an external I/O dependency that reads DOCX
 *   binary data.
 * - NextRequest is constructed using the standard Request API with FormData.
 *   The handler uses req.formData() and req.headers, both available on
 *   the standard Request API.
 * - The route has inline rate limiting with a module-level Map. We use
 *   unique IPs per describe block to avoid cross-test interference.
 */
import type { PdfParseResult } from "pdf-parse";
import { POST } from "@/app/api/upload/route";

// ─── Module-level mocks ─────────────────────────────────────────────────────

vi.mock("pdf-parse/lib/pdf-parse.js", () => ({
  default: vi.fn(async () => ({ text: "Extracted PDF text content" })),
}));

vi.mock("mammoth", () => ({
  extractRawText: vi.fn(async () => ({
    value: "Extracted DOCX text content",
  })),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Create a File object with the given properties.
 * Uses the standard File constructor available in jsdom.
 */
function createFile(
  name: string,
  content: string | Uint8Array = "file content",
  type = "application/octet-stream",
): File {
  if (typeof content === "string") {
    return new File([content], name, { type });
  }
  const ab = content.buffer.slice(
    content.byteOffset,
    content.byteOffset + content.byteLength,
  ) as ArrayBuffer;
  return new File([ab], name, { type });
}

/**
 * Auto-incrementing counter for generating unique IPs per test.
 * The inline rate limiter uses a module-level Map keyed by `${namespace}:${ip}`,
 * so giving each test a unique IP prevents cross-test rate-limit interference.
 */
let ipCounter = 0;
function nextIp(): string {
  ipCounter++;
  const a = (ipCounter >> 16) & 0xff;
  const b = (ipCounter >> 8) & 0xff;
  const c = ipCounter & 0xff;
  return `10.${a}.${b}.${c}`;
}

/**
 * Create a Request with a FormData body containing the given file.
 *
 * In a jsdom/Vitest environment the standard Request constructed with a
 * FormData body does not support `formData()` correctly (it hangs when
 * the route handler calls `req.formData()`). We work around this by
 * overriding the `formData` method on the request to return the
 * prepared FormData directly.
 *
 * By default, each call uses a unique IP to avoid rate-limit interference
 * between tests. Pass an explicit IP only when testing rate limiting.
 */
function createUploadRequest(file?: File, ip?: string): Request {
  const formData = new FormData();
  if (file) {
    formData.append("file", file);
  }

  const request = new Request("http://localhost:3000/api/upload", {
    method: "POST",
    headers: {
      "x-forwarded-for": ip ?? nextIp(),
    },
  });

  // Override formData() so the route handler receives the prepared data
  // without relying on body parsing that hangs in jsdom.
  request.formData = async () => formData;

  return request;
}

/**
 * Create a File that appears to be a given size.
 * Uses Object.defineProperty to override the size getter since
 * the File constructor derives size from the content.
 */
function createOversizedFile(name: string, sizeBytes: number): File {
  const file = createFile(name, "x");
  Object.defineProperty(file, "size", { value: sizeBytes, writable: false });
  return file;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("POST /api/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Missing file ────────────────────────────────────────────────────────

  describe("missing file", () => {
    it("should return 400 when no file is included in the form data", async () => {
      // Arrange -- create request without a file
      const request = createUploadRequest();

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toEqual({ error: "No file uploaded" });
    });
  });

  // ── Invalid file extension ──────────────────────────────────────────────

  describe("invalid file extension", () => {
    it("should return 400 for unsupported file extension (.jpg)", async () => {
      // Arrange
      const file = createFile("photo.jpg");
      const request = createUploadRequest(file);

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toEqual({
        error: "Only .pdf, .docx and .txt files are supported",
      });
    });

    it("should return 400 for unsupported file extension (.html)", async () => {
      // Arrange
      const file = createFile("resume.html");
      const request = createUploadRequest(file);

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toEqual({
        error: "Only .pdf, .docx and .txt files are supported",
      });
    });

    it("should return 400 for file with no extension", async () => {
      // Arrange
      const file = createFile("README");
      const request = createUploadRequest(file);

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toEqual({
        error: "Only .pdf, .docx and .txt files are supported",
      });
    });

    it("should accept extensions regardless of case (.PDF)", async () => {
      // Arrange
      const file = createFile("cv.PDF", "PDF content");
      const request = createUploadRequest(file);

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert -- should not get 400 for extension validation
      // (may get different status depending on extraction, but not 400 for extension)
      expect(response.status).not.toBe(400);
    });
  });

  // ── File size validation ──────────────────────────────────────────────

  describe("file size validation", () => {
    it("should return 400 for files over 10 MB", async () => {
      // Arrange -- 10 MB + 1 byte
      const file = createOversizedFile("large-cv.pdf", 10 * 1024 * 1024 + 1);
      const request = createUploadRequest(file);

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toEqual({ error: "File must be under 10 MB" });
    });

    it("should accept a file that is exactly 10 MB", async () => {
      // Arrange -- exactly at the boundary
      const file = createOversizedFile("boundary-cv.txt", 10 * 1024 * 1024);
      const request = createUploadRequest(file);

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert -- should not be rejected for size
      expect(response.status).not.toBe(400);
    });
  });

  // ── Successful extraction ─────────────────────────────────────────────

  describe("successful text extraction", () => {
    it("should extract text from a PDF file and return 200", async () => {
      // Arrange
      const file = createFile("resume.pdf", "binary pdf content");
      const request = createUploadRequest(file);

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({
        text: "Extracted PDF text content",
        fileName: "resume.pdf",
      });
    });

    it("should extract text from a DOCX file and return 200", async () => {
      // Arrange
      const file = createFile("resume.docx", "binary docx content");
      const request = createUploadRequest(file);

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({
        text: "Extracted DOCX text content",
        fileName: "resume.docx",
      });
    });

    it("should extract text from a TXT file and return 200", async () => {
      // Arrange
      const textContent =
        "John Smith\nSenior Software Engineer\n5 years experience";
      const file = createFile("resume.txt", textContent);
      const request = createUploadRequest(file);

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.text).toBe(textContent);
      expect(body.fileName).toBe("resume.txt");
    });

    it("should return the original file name in the response", async () => {
      // Arrange
      const file = createFile("My Resume (2025).txt", "CV content");
      const request = createUploadRequest(file);

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.fileName).toBe("My Resume (2025).txt");
    });
  });

  // ── Empty text extraction ─────────────────────────────────────────────

  describe("empty text extraction", () => {
    it("should return 422 when PDF extraction yields empty text", async () => {
      // Arrange
      const pdfParseMock = await import("pdf-parse/lib/pdf-parse.js");
      vi.mocked(pdfParseMock.default).mockResolvedValueOnce({
        text: "   ",
      } as PdfParseResult);

      const file = createFile("empty.pdf", "binary content");
      const request = createUploadRequest(file);

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body).toEqual({
        error: "Could not extract any text from the file",
      });
    });

    it("should return 422 when DOCX extraction yields empty text", async () => {
      // Arrange
      const mammothMock = await import("mammoth");
      vi.mocked(mammothMock.extractRawText).mockResolvedValueOnce({
        value: "",
        messages: [],
      });

      const file = createFile("empty.docx", "binary content");
      const request = createUploadRequest(file);

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body).toEqual({
        error: "Could not extract any text from the file",
      });
    });

    it("should return 422 when TXT file contains only whitespace", async () => {
      // Arrange
      const file = createFile("blank.txt", "   \n\t  \n  ");
      const request = createUploadRequest(file);

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body).toEqual({
        error: "Could not extract any text from the file",
      });
    });
  });

  // ── Extraction failure ────────────────────────────────────────────────

  describe("extraction failure", () => {
    it("should return 500 when PDF parsing throws an error", async () => {
      // Arrange
      const pdfParseMock = await import("pdf-parse/lib/pdf-parse.js");
      vi.mocked(pdfParseMock.default).mockRejectedValueOnce(
        new Error("Corrupt PDF"),
      );

      const file = createFile("corrupt.pdf", "bad data");
      const request = createUploadRequest(file);

      // Suppress expected console.error
      vi.spyOn(console, "error").mockImplementation(() => {});

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Failed to process uploaded file" });
    });

    it("should return 500 when DOCX extraction throws an error", async () => {
      // Arrange
      const mammothMock = await import("mammoth");
      vi.mocked(mammothMock.extractRawText).mockRejectedValueOnce(
        new Error("Invalid DOCX format"),
      );

      const file = createFile("corrupt.docx", "bad data");
      const request = createUploadRequest(file);

      // Suppress expected console.error
      vi.spyOn(console, "error").mockImplementation(() => {});

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Failed to process uploaded file" });
    });
  });

  // ── Rate Limiting ─────────────────────────────────────────────────────

  describe("rate limiting", () => {
    it("should return 429 after exhausting the rate limit (100 requests per 60s)", async () => {
      // Arrange -- use a dedicated IP for rate limit testing
      const rateLimitIp = "10.200.200.2";

      // Send 100 valid requests (all should succeed)
      for (let i = 0; i < 100; i++) {
        const file = createFile("cv.txt", "CV content for rate limit test");
        const request = createUploadRequest(file, rateLimitIp);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await POST(request as any);
        expect(response.status).toBe(200);
      }

      // Act -- the 101st request should be rate limited
      const file = createFile("cv.txt", "One more request");
      const request = createUploadRequest(file, rateLimitIp);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(429);
      const body = await response.json();
      expect(body).toEqual({
        error: "Too many requests. Please wait a moment and try again.",
      });
    });
  });
});
