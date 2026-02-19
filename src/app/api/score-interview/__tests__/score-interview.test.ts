/**
 * Unit tests for the POST /api/score-interview route handler.
 *
 * Tests the interview scoring endpoint that sends the interview transcript
 * and optional CV text to Claude for ELO-based performance scoring with
 * the R.J. Carrington III boss character. Validates input constraints,
 * response shape, tier self-healing, verdict self-healing, bossSummary
 * validation, and error handling.
 *
 * KEY DIFFERENCES FROM INTERVIEW-ELO:
 * - No jdText field in any request body or validation test
 * - verdict ("HIRED" | "NOT HIRED") validation and self-healing
 * - bossSummary (non-empty string) validation
 * - Boss-themed tier names (Wasting My Time, Shows a Pulse, Adequate,
 *   Noteworthy, Impressive, Hired Material)
 *
 * Mocking strategy:
 * - @anthropic-ai/sdk is mocked at the module boundary -- it is an external
 *   service (Anthropic API) and must not be called in unit tests.
 * - process.env is manipulated directly per test for ANTHROPIC_API_KEY.
 * - The route has inline rate limiting with a module-level Map that persists
 *   across tests. We isolate rate-limit state by re-importing the route
 *   module per test via vi.importActual, but since the Map is module-scoped
 *   we rely on the high rate limit (30 per 60s) being sufficient for our
 *   test count within each describe block. Dedicated rate-limit tests
 *   exhaust the limit deliberately.
 */
import { POST } from "@/app/api/score-interview/route";

// ─── Module-level mocks ─────────────────────────────────────────────────────

// Mock the Anthropic SDK at the module boundary.
// The mock returns a valid scoring JSON by default; individual tests
// override the response content to exercise validation paths.
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn().mockImplementation(function (
      this: { messages: { create: typeof mockCreate } },
    ) {
      this.messages = { create: mockCreate };
    }),
  };
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/** All 5 valid scoring dimension keys */
const ALL_DIMENSION_NAMES = [
  "communication",
  "technical",
  "behavioural",
  "confidence",
  "questionsAsked",
] as const;

/**
 * Builds a complete, valid scoring response object that matches the expected
 * Claude output format. Individual tests can override specific fields.
 *
 * Uses boss-themed tier names and includes verdict + bossSummary.
 * Default ELO 1250 maps to "Adequate" tier (1000-1399) and "NOT HIRED" verdict.
 */
function buildValidScoringResponse(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    eloRating: 1250,
    tier: "Adequate",
    verdict: "NOT HIRED",
    bossSummary:
      "You didn't embarrass yourself entirely, which puts you ahead of most. But 'not embarrassing' is a low bar, and you barely cleared it.",
    dimensions: ALL_DIMENSION_NAMES.map((name) => ({
      name,
      score: 7,
      feedback: `Detailed feedback for ${name} dimension in the boss's voice.`,
    })),
    moments: [
      {
        type: "good",
        question: "Can you tell me about a technical challenge you led?",
        quote: "I led the migration from monolith to microservices.",
        explanation:
          "Strong example of technical leadership. I'll give you that one -- grudgingly.",
      },
      {
        type: "inaccuracy",
        question: "What technologies did you use on the backend?",
        quote: "We used React for the backend.",
        explanation:
          "React is a frontend library, not a backend framework. I expected better.",
      },
      {
        type: "brilliant",
        question: "How did you measure the success of that project?",
        quote:
          "We measured success by tracking deployment frequency and lead time.",
        explanation:
          "Demonstrates awareness of DORA metrics. This was... acceptable. More than acceptable.",
      },
    ],
    isPartial: false,
    ...overrides,
  };
}

/**
 * Configures the mock Anthropic SDK to return a text block containing
 * the given JSON response. Wraps the response in the Anthropic message
 * content format: `{ content: [{ type: 'text', text: JSON.stringify(response) }] }`.
 */
function mockClaudeResponse(response: Record<string, unknown>): void {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: "text", text: JSON.stringify(response) }],
  });
}

/**
 * Configures the mock Anthropic SDK to return a text block containing
 * raw text (not necessarily valid JSON).
 */
function mockClaudeRawResponse(text: string): void {
  mockCreate.mockResolvedValueOnce({
    content: [{ type: "text", text }],
  });
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
 * Helper to construct a Request object compatible with the score-interview handler.
 * The handler uses req.json() and req.headers.get("x-forwarded-for"),
 * both available on the standard Request API.
 *
 * By default, each call uses a unique IP to avoid rate-limit interference
 * between tests. Pass an explicit IP only when testing rate limiting.
 */
function createRequest(
  body: Record<string, unknown>,
  ip?: string,
): Request {
  return new Request("http://localhost:3000/api/score-interview", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip ?? nextIp(),
    },
    body: JSON.stringify(body),
  });
}

/**
 * Standard valid request body with all fields.
 * NOTE: No jdText -- this project does not use job descriptions.
 */
function validRequestBody(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    transcript:
      "Interviewer: Tell me about your experience.\nCandidate: I have been working with TypeScript for 6 years.",
    cvText:
      "John Doe - Software Engineer with 6 years of experience in TypeScript, React, and Node.js.",
    ...overrides,
  };
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe("POST /api/score-interview", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    // Restore a clean environment for each test
    process.env = { ...ORIGINAL_ENV, ANTHROPIC_API_KEY: "test-api-key-123" };
    // Reset all mock call counts and implementations
    mockCreate.mockReset();
    // Suppress console output in tests
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  // ── Input Validation: Missing Required Fields ─────────────────────────────

  describe("missing required fields", () => {
    it("should return 400 when transcript is missing from the request body", async () => {
      // Arrange -- only cvText, no transcript
      const request = createRequest({ cvText: "Some CV text" });

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toEqual({ error: "Interview transcript is required" });
    });

    it("should return 400 when the request body is empty", async () => {
      // Arrange
      const request = createRequest({});

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(400);
    });

    it("should return 400 when transcript is an empty string", async () => {
      // Arrange
      const request = createRequest({ transcript: "" });

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toEqual({ error: "Interview transcript is required" });
    });

    it("should return 400 when transcript is whitespace only", async () => {
      // Arrange
      const request = createRequest({ transcript: "   \n\t  " });

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toEqual({ error: "Interview transcript is required" });
    });

    it("should succeed when request has transcript but no jdText (jdText is not required)", async () => {
      // Arrange -- this project does NOT use jdText
      mockClaudeResponse(buildValidScoringResponse());
      const request = createRequest({
        transcript:
          "Interviewer: Tell me about yourself.\nCandidate: I am a developer.",
      });

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
    });
  });

  // ── Input Validation: Length Limits ────────────────────────────────────────

  describe("input length validation", () => {
    it("should return 400 when cvText exceeds 100,000 characters", async () => {
      // Arrange
      const longCv = "x".repeat(100_001);
      const request = createRequest(validRequestBody({ cvText: longCv }));

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toEqual({ error: "CV text exceeds maximum length" });
    });

    it("should return 400 when transcript exceeds 200,000 characters", async () => {
      // Arrange
      const longTranscript = "x".repeat(200_001);
      const request = createRequest(
        validRequestBody({ transcript: longTranscript }),
      );

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toEqual({ error: "Transcript exceeds maximum length" });
    });

    it("should accept cvText at exactly 100,000 characters", async () => {
      // Arrange
      const exactCv = "x".repeat(100_000);
      mockClaudeResponse(buildValidScoringResponse());
      const request = createRequest(validRequestBody({ cvText: exactCv }));

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
    });

    it("should accept transcript at exactly 200,000 characters", async () => {
      // Arrange
      const exactTranscript = "x".repeat(200_000);
      mockClaudeResponse(buildValidScoringResponse());
      const request = createRequest(
        validRequestBody({ transcript: exactTranscript }),
      );

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
    });

    it("should return 400 when cvText is provided but is not a string", async () => {
      // Arrange
      const request = createRequest(validRequestBody({ cvText: 12345 }));

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body).toEqual({ error: "CV text must be a string" });
    });
  });

  // ── Environment Variable Validation ───────────────────────────────────────

  describe("missing ANTHROPIC_API_KEY", () => {
    it('should return 500 with "Service configuration error" when ANTHROPIC_API_KEY is not set', async () => {
      // Arrange
      delete process.env.ANTHROPIC_API_KEY;
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Service configuration error" });
    });

    it("should return 500 when ANTHROPIC_API_KEY is an empty string", async () => {
      // Arrange
      process.env.ANTHROPIC_API_KEY = "";
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Service configuration error" });
    });

    it("should not invoke the Claude API when ANTHROPIC_API_KEY is missing", async () => {
      // Arrange
      delete process.env.ANTHROPIC_API_KEY;
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await POST(request as any);

      // Assert
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  // ── Successful Scoring ────────────────────────────────────────────────────

  describe("successful scoring", () => {
    it("should return 200 with a complete ScoringResults object when given valid input", async () => {
      // Arrange
      const scoringResponse = buildValidScoringResponse();
      mockClaudeResponse(scoringResponse);
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();

      // Verify top-level fields
      expect(body.eloRating).toBe(1250);
      expect(body.tier).toBe("Adequate");
      expect(body.verdict).toBe("NOT HIRED");
      expect(typeof body.bossSummary).toBe("string");
      expect(body.bossSummary.length).toBeGreaterThan(0);
      expect(body.isPartial).toBe(false);

      // Verify all 5 dimensions are present
      expect(body.dimensions).toHaveLength(5);
      const dimensionNames = body.dimensions.map(
        (d: { name: string }) => d.name,
      );
      expect(dimensionNames).toEqual(
        expect.arrayContaining([
          "communication",
          "technical",
          "behavioural",
          "confidence",
          "questionsAsked",
        ]),
      );

      // Verify each dimension has required fields
      for (const dim of body.dimensions) {
        expect(typeof dim.name).toBe("string");
        expect(typeof dim.score).toBe("number");
        expect(typeof dim.feedback).toBe("string");
        expect(dim.feedback.length).toBeGreaterThan(0);
      }

      // Verify moments array
      expect(body.moments).toHaveLength(3);
      for (const moment of body.moments) {
        expect(typeof moment.type).toBe("string");
        expect(typeof moment.question).toBe("string");
        expect(typeof moment.quote).toBe("string");
        expect(typeof moment.explanation).toBe("string");
        expect(typeof moment.explanation).toBe("string");
      }
    });

    it("should return 200 when cvText is omitted (optional field)", async () => {
      // Arrange
      mockClaudeResponse(buildValidScoringResponse());
      const request = createRequest({
        transcript:
          "Interviewer: Tell me about yourself.\nCandidate: I am a developer.",
      });

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
    });

    it("should return 200 when cvText is null (CV skipped)", async () => {
      // Arrange
      mockClaudeResponse(buildValidScoringResponse());
      const request = createRequest(validRequestBody({ cvText: null }));

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
    });

    it("should include a note field when Claude provides one", async () => {
      // Arrange
      mockClaudeResponse(
        buildValidScoringResponse({
          note: "This was barely an interview. You gave me almost nothing to work with.",
        }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.note).toBe(
        "This was barely an interview. You gave me almost nothing to work with.",
      );
    });

    it("should omit the note field when Claude returns null for it", async () => {
      // Arrange
      mockClaudeResponse(buildValidScoringResponse({ note: null }));
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.note).toBeUndefined();
    });

    it("should round a decimal eloRating to the nearest integer", async () => {
      // Arrange
      mockClaudeResponse(buildValidScoringResponse({ eloRating: 1250.7 }));
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.eloRating).toBe(1251);
    });

    it("should strip markdown fences from the Claude response", async () => {
      // Arrange
      const validResponse = buildValidScoringResponse();
      mockClaudeRawResponse(
        "```json\n" + JSON.stringify(validResponse) + "\n```",
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.eloRating).toBe(1250);
    });
  });

  // ── Response Validation: Missing Dimensions ───────────────────────────────

  describe("missing dimensions", () => {
    it("should return 500 when Claude returns fewer than 5 dimensions", async () => {
      // Arrange -- only 3 of 5 dimensions
      const incompleteDimensions = [
        { name: "communication", score: 7, feedback: "Good communication." },
        {
          name: "technical",
          score: 6,
          feedback: "Solid technical knowledge.",
        },
        {
          name: "behavioural",
          score: 8,
          feedback: "Excellent behavioural responses.",
        },
      ];
      mockClaudeResponse(
        buildValidScoringResponse({ dimensions: incompleteDimensions }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Failed to score the interview" });
    });

    it("should return 500 when dimensions array is empty", async () => {
      // Arrange
      mockClaudeResponse(buildValidScoringResponse({ dimensions: [] }));
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Failed to score the interview" });
    });

    it("should return 500 when dimensions field is missing entirely", async () => {
      // Arrange
      const response_ = buildValidScoringResponse();
      delete response_.dimensions;
      mockClaudeResponse(response_);
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Failed to score the interview" });
    });
  });

  // ── Response Validation: Invalid Dimension Keys ───────────────────────────

  describe("invalid dimension keys", () => {
    it("should return 500 when a dimension name is not in the allowed set", async () => {
      // Arrange -- replace "communication" with "socialSkills"
      const invalidDimensions = ALL_DIMENSION_NAMES.map((name) => ({
        name: name === "communication" ? "socialSkills" : name,
        score: 7,
        feedback: `Feedback for ${name}.`,
      }));
      mockClaudeResponse(
        buildValidScoringResponse({ dimensions: invalidDimensions }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Failed to score the interview" });
    });

    it("should return 500 when a dimension has duplicate keys", async () => {
      // Arrange -- "communication" appears twice, "questionsAsked" missing
      const duplicateDimensions = ALL_DIMENSION_NAMES.map((name) => ({
        name: name === "questionsAsked" ? "communication" : name,
        score: 7,
        feedback: `Feedback for ${name}.`,
      }));
      mockClaudeResponse(
        buildValidScoringResponse({ dimensions: duplicateDimensions }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Failed to score the interview" });
    });
  });

  // ── Response Validation: Invalid Annotation Types ─────────────────────────

  describe("invalid annotation types", () => {
    it("should return 500 when a moment has an annotation type not in the allowed set", async () => {
      // Arrange
      const invalidMoments = [
        {
          type: "excellent", // not a valid type
          question: "Tell me about your biggest project.",
          quote: "I built the entire system from scratch.",
          explanation: "Shows initiative.",
        },
      ];
      mockClaudeResponse(
        buildValidScoringResponse({ moments: invalidMoments }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Failed to score the interview" });
    });

    it("should return 500 when a moment has an empty type string", async () => {
      // Arrange
      const invalidMoments = [
        {
          type: "",
          question: "Tell me about yourself.",
          quote: "Some quote.",
          explanation: "Some explanation.",
        },
      ];
      mockClaudeResponse(
        buildValidScoringResponse({ moments: invalidMoments }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Failed to score the interview" });
    });

    it("should accept all six valid annotation types", async () => {
      // Arrange
      const allTypeMoments = [
        {
          type: "brilliant",
          question: "Q1?",
          quote: "Quote 1.",
          explanation: "Explanation 1.",
        },
        {
          type: "good",
          question: "Q2?",
          quote: "Quote 2.",
          explanation: "Explanation 2.",
        },
        {
          type: "neutral",
          question: "Q3?",
          quote: "Quote 3.",
          explanation: "Explanation 3.",
        },
        {
          type: "inaccuracy",
          question: "Q4?",
          quote: "Quote 4.",
          explanation: "Explanation 4.",
        },
        {
          type: "mistake",
          question: "Q5?",
          quote: "Quote 5.",
          explanation: "Explanation 5.",
        },
        {
          type: "blunder",
          question: "Q6?",
          quote: "Quote 6.",
          explanation: "Explanation 6.",
        },
      ];
      mockClaudeResponse(
        buildValidScoringResponse({ moments: allTypeMoments }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.moments).toHaveLength(6);
    });
  });

  // ── Tier Self-Healing ─────────────────────────────────────────────────────

  describe("tier self-healing", () => {
    it('should correct tier to "Noteworthy" when rating is 1450 and Claude returns wrong tier', async () => {
      // Arrange -- Claude says "Impressive" but 1450 maps to "Noteworthy" (1400-1799)
      mockClaudeResponse(
        buildValidScoringResponse({
          eloRating: 1450,
          tier: "Impressive",
          verdict: "NOT HIRED",
        }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.eloRating).toBe(1450);
      expect(body.tier).toBe("Noteworthy");
    });

    it('should correct tier to "Shows a Pulse" when rating is 600 and Claude returns wrong tier', async () => {
      // Arrange -- Claude says "Wasting My Time" but 600 maps to "Shows a Pulse" (600-999)
      mockClaudeResponse(
        buildValidScoringResponse({
          eloRating: 600,
          tier: "Wasting My Time",
          verdict: "NOT HIRED",
        }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.eloRating).toBe(600);
      expect(body.tier).toBe("Shows a Pulse");
    });

    it("should preserve the tier when Claude returns the correct one for the rating", async () => {
      // Arrange -- rating 1250 correctly maps to "Adequate" (1000-1399)
      mockClaudeResponse(
        buildValidScoringResponse({
          eloRating: 1250,
          tier: "Adequate",
          verdict: "NOT HIRED",
        }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.tier).toBe("Adequate");
    });

    it('should correct tier to "Wasting My Time" for rating at the minimum boundary (100)', async () => {
      // Arrange
      mockClaudeResponse(
        buildValidScoringResponse({
          eloRating: 100,
          tier: "Shows a Pulse",
          verdict: "NOT HIRED",
        }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.eloRating).toBe(100);
      expect(body.tier).toBe("Wasting My Time");
    });

    it('should correct tier to "Hired Material" for rating at the maximum boundary (3000)', async () => {
      // Arrange
      mockClaudeResponse(
        buildValidScoringResponse({
          eloRating: 3000,
          tier: "Impressive",
          verdict: "HIRED",
        }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.eloRating).toBe(3000);
      expect(body.tier).toBe("Hired Material");
    });

    it("should correct tier at each tier boundary lower edge", async () => {
      // Test that each tier boundary is correctly mapped using boss tier names
      const tierBoundaries: Array<{
        rating: number;
        expectedTier: string;
      }> = [
        { rating: 100, expectedTier: "Wasting My Time" },
        { rating: 599, expectedTier: "Wasting My Time" },
        { rating: 600, expectedTier: "Shows a Pulse" },
        { rating: 999, expectedTier: "Shows a Pulse" },
        { rating: 1000, expectedTier: "Adequate" },
        { rating: 1399, expectedTier: "Adequate" },
        { rating: 1400, expectedTier: "Noteworthy" },
        { rating: 1799, expectedTier: "Noteworthy" },
        { rating: 1800, expectedTier: "Impressive" },
        { rating: 2199, expectedTier: "Impressive" },
        { rating: 2200, expectedTier: "Hired Material" },
        { rating: 3000, expectedTier: "Hired Material" },
      ];

      for (const { rating, expectedTier } of tierBoundaries) {
        // Arrange -- intentionally set wrong tier so self-healing kicks in
        const verdict = rating >= 2200 ? "HIRED" : "NOT HIRED";
        mockClaudeResponse(
          buildValidScoringResponse({
            eloRating: rating,
            tier: rating < 1000 ? "Hired Material" : "Wasting My Time",
            verdict,
          }),
        );
        const request = createRequest(validRequestBody());

        // Act
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await POST(request as any);

        // Assert
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.tier).toBe(expectedTier);
      }
    });
  });

  // ── Verdict Self-Healing ──────────────────────────────────────────────────

  describe("verdict self-healing", () => {
    it('should correct HIRED to NOT HIRED when ELO is 1800 (below 2200 threshold)', async () => {
      // Arrange -- Claude says "HIRED" but rating 1800 is below HIRED_THRESHOLD (2200)
      mockClaudeResponse(
        buildValidScoringResponse({
          eloRating: 1800,
          verdict: "HIRED",
        }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.eloRating).toBe(1800);
      expect(body.verdict).toBe("NOT HIRED");
    });

    it('should correct NOT HIRED to HIRED when ELO is 2300 (at or above 2200 threshold)', async () => {
      // Arrange -- Claude says "NOT HIRED" but rating 2300 is >= HIRED_THRESHOLD
      mockClaudeResponse(
        buildValidScoringResponse({
          eloRating: 2300,
          verdict: "NOT HIRED",
        }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.eloRating).toBe(2300);
      expect(body.verdict).toBe("HIRED");
    });

    it('should keep HIRED when ELO is exactly 2200 (boundary)', async () => {
      // Arrange -- ELO 2200 is exactly at the threshold, HIRED is correct
      mockClaudeResponse(
        buildValidScoringResponse({
          eloRating: 2200,
          verdict: "HIRED",
        }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.eloRating).toBe(2200);
      expect(body.verdict).toBe("HIRED");
    });

    it('should keep NOT HIRED when ELO is 2199 (just below boundary)', async () => {
      // Arrange -- ELO 2199 is below threshold, NOT HIRED is correct
      mockClaudeResponse(
        buildValidScoringResponse({
          eloRating: 2199,
          verdict: "NOT HIRED",
        }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.eloRating).toBe(2199);
      expect(body.verdict).toBe("NOT HIRED");
    });

    it('should correct NOT HIRED to HIRED at the exact 2200 boundary', async () => {
      // Arrange -- Claude says NOT HIRED but ELO is exactly 2200
      mockClaudeResponse(
        buildValidScoringResponse({
          eloRating: 2200,
          verdict: "NOT HIRED",
        }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.verdict).toBe("HIRED");
    });

    it('should correct HIRED to NOT HIRED at 2199 (one below boundary)', async () => {
      // Arrange -- Claude says HIRED but ELO is 2199 (below threshold)
      mockClaudeResponse(
        buildValidScoringResponse({
          eloRating: 2199,
          verdict: "HIRED",
        }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.verdict).toBe("NOT HIRED");
    });
  });

  // ── bossSummary Validation ────────────────────────────────────────────────

  describe("bossSummary validation", () => {
    it("should return 500 when bossSummary is missing", async () => {
      // Arrange
      const response_ = buildValidScoringResponse();
      delete response_.bossSummary;
      mockClaudeResponse(response_);
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Failed to score the interview" });
    });

    it("should return 500 when bossSummary is an empty string", async () => {
      // Arrange
      mockClaudeResponse(buildValidScoringResponse({ bossSummary: "" }));
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Failed to score the interview" });
    });

    it("should return 500 when bossSummary is whitespace only", async () => {
      // Arrange
      mockClaudeResponse(
        buildValidScoringResponse({ bossSummary: "   \n\t  " }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Failed to score the interview" });
    });

    it("should return 500 when bossSummary is not a string", async () => {
      // Arrange
      mockClaudeResponse(buildValidScoringResponse({ bossSummary: 42 }));
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Failed to score the interview" });
    });
  });

  // ── Verdict Validation ────────────────────────────────────────────────────

  describe("verdict validation", () => {
    it('should accept valid verdict "HIRED" with ELO >= 2200', async () => {
      // Arrange
      mockClaudeResponse(
        buildValidScoringResponse({
          eloRating: 2500,
          verdict: "HIRED",
        }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.verdict).toBe("HIRED");
    });

    it('should accept valid verdict "NOT HIRED" with ELO < 2200', async () => {
      // Arrange
      mockClaudeResponse(
        buildValidScoringResponse({
          eloRating: 1000,
          verdict: "NOT HIRED",
        }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.verdict).toBe("NOT HIRED");
    });

    it("should self-heal an invalid verdict value via the ELO-based derivation", async () => {
      // Arrange -- Claude returns "MAYBE" which is invalid, but the server
      // derives verdict from the ELO rating regardless. The route does not
      // validate the returned verdict string; it derives the correct one.
      mockClaudeResponse(
        buildValidScoringResponse({
          eloRating: 1250,
          verdict: "MAYBE",
        }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      // The server derives verdict from ELO, so 1250 -> NOT HIRED
      expect(body.verdict).toBe("NOT HIRED");
    });
  });

  // ── isPartial Flag ────────────────────────────────────────────────────────

  describe("isPartial flag", () => {
    it("should pass through isPartial as true when Claude sets it", async () => {
      // Arrange
      mockClaudeResponse(
        buildValidScoringResponse({
          isPartial: true,
          note: "This was barely an interview. You gave me almost nothing to work with.",
        }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.isPartial).toBe(true);
    });

    it("should pass through isPartial as false when Claude sets it to false", async () => {
      // Arrange
      mockClaudeResponse(buildValidScoringResponse({ isPartial: false }));
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.isPartial).toBe(false);
    });

    it("should default isPartial to false when Claude omits it", async () => {
      // Arrange
      const response_ = buildValidScoringResponse();
      delete response_.isPartial;
      mockClaudeResponse(response_);
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.isPartial).toBe(false);
    });
  });

  // ── ELO Rating Out of Range ───────────────────────────────────────────────

  describe("ELO rating out of range", () => {
    it("should return 500 when eloRating is below 100", async () => {
      // Arrange
      mockClaudeResponse(buildValidScoringResponse({ eloRating: 50 }));
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Failed to score the interview" });
    });

    it("should return 500 when eloRating is above 3000", async () => {
      // Arrange
      mockClaudeResponse(buildValidScoringResponse({ eloRating: 3500 }));
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Failed to score the interview" });
    });

    it("should return 500 when eloRating is not a number", async () => {
      // Arrange
      mockClaudeResponse(buildValidScoringResponse({ eloRating: "high" }));
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Failed to score the interview" });
    });

    it("should return 500 when eloRating is NaN", async () => {
      // Arrange
      mockClaudeResponse(buildValidScoringResponse({ eloRating: NaN }));
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Failed to score the interview" });
    });

    it("should accept eloRating at the minimum boundary (100)", async () => {
      // Arrange
      mockClaudeResponse(
        buildValidScoringResponse({
          eloRating: 100,
          tier: "Wasting My Time",
          verdict: "NOT HIRED",
        }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.eloRating).toBe(100);
    });

    it("should accept eloRating at the maximum boundary (3000)", async () => {
      // Arrange
      mockClaudeResponse(
        buildValidScoringResponse({
          eloRating: 3000,
          tier: "Hired Material",
          verdict: "HIRED",
        }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.eloRating).toBe(3000);
    });
  });

  // ── Claude API Error Handling ─────────────────────────────────────────────

  describe("Claude API error handling", () => {
    it("should return 500 when the Claude API throws an error", async () => {
      // Arrange
      mockCreate.mockRejectedValueOnce(
        new Error("Anthropic API error: rate limit exceeded"),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toBeTruthy();
    });

    it("should return 500 when Claude returns an empty response", async () => {
      // Arrange
      mockCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "" }],
      });
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Failed to score the interview" });
    });

    it("should return 500 when Claude returns whitespace-only response", async () => {
      // Arrange
      mockCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "   \n  " }],
      });
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Failed to score the interview" });
    });

    it("should return 500 when Claude returns invalid JSON", async () => {
      // Arrange
      mockClaudeRawResponse("This is not valid JSON {{{");
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Failed to score the interview" });
    });

    it("should return 500 when Claude returns no text blocks", async () => {
      // Arrange -- response with no text blocks (e.g., only tool_use blocks)
      mockCreate.mockResolvedValueOnce({
        content: [],
      });
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Failed to score the interview" });
    });
  });

  // ── Response Validation: Dimension Content ────────────────────────────────

  describe("dimension content validation", () => {
    it("should return 500 when a dimension has empty feedback", async () => {
      // Arrange
      const dims = ALL_DIMENSION_NAMES.map((name) => ({
        name,
        score: 7,
        feedback: name === "technical" ? "" : `Feedback for ${name}.`,
      }));
      mockClaudeResponse(buildValidScoringResponse({ dimensions: dims }));
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Failed to score the interview" });
    });

    it("should return 500 when a dimension has a non-numeric score", async () => {
      // Arrange
      const dims = ALL_DIMENSION_NAMES.map((name) => ({
        name,
        score: name === "confidence" ? "high" : 7,
        feedback: `Feedback for ${name}.`,
      }));
      mockClaudeResponse(buildValidScoringResponse({ dimensions: dims }));
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Failed to score the interview" });
    });

    it("should return 500 when a moment has an empty quote", async () => {
      // Arrange
      const invalidMoments = [
        {
          type: "good",
          question: "Tell me about yourself.",
          quote: "",
          explanation: "Some explanation.",
        },
      ];
      mockClaudeResponse(
        buildValidScoringResponse({ moments: invalidMoments }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Failed to score the interview" });
    });

    it("should return 500 when a moment has an empty explanation", async () => {
      // Arrange
      const invalidMoments = [
        {
          type: "blunder",
          question: "How did you handle that?",
          quote: "Some quote.",
          explanation: "",
        },
      ];
      mockClaudeResponse(
        buildValidScoringResponse({ moments: invalidMoments }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Failed to score the interview" });
    });

    it("should return 500 when moments field is not an array", async () => {
      // Arrange
      mockClaudeResponse(
        buildValidScoringResponse({ moments: "not an array" }),
      );
      const request = createRequest(validRequestBody());

      // Act
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await POST(request as any);

      // Assert
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Failed to score the interview" });
    });
  });

  // ── Rate Limiting ─────────────────────────────────────────────────────────

  describe("rate limiting", () => {
    it("should return 429 after exhausting the rate limit (30 requests per 60s)", async () => {
      // Arrange -- use a dedicated IP for rate limit testing
      const rateLimitIp = "10.200.200.1";

      // Send 30 valid requests (all should succeed)
      for (let i = 0; i < 30; i++) {
        mockClaudeResponse(buildValidScoringResponse());
        const request = createRequest(validRequestBody(), rateLimitIp);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await POST(request as any);
        expect(response.status).toBe(200);
      }

      // Act -- the 31st request should be rate limited
      const request = createRequest(validRequestBody(), rateLimitIp);
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
