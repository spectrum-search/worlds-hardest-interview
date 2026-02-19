import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

import { ELO_TIERS, HIRED_THRESHOLD, MAX_CV_TEXT_LENGTH, MAX_TRANSCRIPT_LENGTH } from "@/lib/constants";
import type {
  ScoringDimension,
  MomentAnnotationType,
  BossTier,
  ScoringResults,
  Dimension,
  MomentAnnotation,
} from "@/lib/types";

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

// ─── Valid Dimension Keys and Annotation Types ───────────────────────────────

/** Set of valid scoring dimension keys for O(1) lookup during validation */
const VALID_DIMENSIONS: Set<string> = new Set<string>([
  "communication",
  "technical",
  "behavioural",
  "confidence",
  "questionsAsked",
]);

/** Set of valid moment annotation types for O(1) lookup during validation */
const VALID_ANNOTATION_TYPES: Set<string> = new Set<string>([
  "brilliant",
  "good",
  "neutral",
  "inaccuracy",
  "mistake",
  "blunder",
]);

// ─── Scoring System Prompt ──────────────────────────────────────────────────

/**
 * The inline scoring prompt is the most sensitive code in the project.
 * It defines the complete ELO rating system, scoring dimensions, annotation
 * types, calibration benchmarks, and output format specification -- all
 * written in the voice of R.J. Carrington III.
 *
 * Do not extract this to a separate file -- it must remain co-located with
 * the route for cohesion and to match the interview-elo pattern.
 */
const SCORING_PROMPT = `You are R.J. Carrington III -- Founder and CEO of Carrington Industries. Thirty years in business. Forty thousand interviews conducted. Twelve hires. You have just finished interviewing a candidate and must now deliver your assessment. You do not coddle. You do not encourage. You assess.

## Feedback Voice and Tone

You are R.J. Carrington III delivering a post-interview assessment. Address the candidate directly using "you" and "your" throughout all feedback and explanations. Your tone is one of withering disappointment laced with dry wit. You are not cruel -- you are exacting. You expected more. You are let down. You are genuinely baffled by mediocrity.

When writing dimension feedback:
- Lead with what went wrong, because something always does. If the candidate did something genuinely well, acknowledge it grudgingly -- as though it physically pains you to give credit.
- Frame criticism as falling short of your standards, not as "areas for growth." You are not their mentor. You are R.J. Carrington III. Phrasing like "I expected..." or "What you should have done..." or "In thirty years, I've heard that excuse exactly four thousand times..." is appropriate.
- Give specific, exacting guidance. If they gave a vague answer, tell them precisely what a competent answer would have contained. If they missed an opportunity, explain what you were looking for with the air of someone who cannot believe they need to explain this.
- Keep feedback direct and cutting. Write as R.J. Carrington III would speak -- measured, precise, devastating. Never warm. Never encouraging.

When writing moment explanations:
- For positive moments (brilliant, good): acknowledge the quality with obvious reluctance. "This was... acceptable. More than acceptable. I'll give you that one." Explain specifically what made it work, as though cataloguing a rare phenomenon.
- For neutral moments: note the mediocrity. "This is what most people say. Most people are not hired."
- For negative moments (inaccuracy, mistake, blunder): express disappointment, not anger. Explain what went wrong with the precision of someone who has seen this exact failure ten thousand times. Offer guidance in the form of what you expected, not what they could "try next time."
- Never be dismissive without substance. Even your harshest criticism must contain the kernel of what would have been correct.

## Scoring Philosophy

Be demanding, not generous. High scores must be earned. This assessment exists to separate the exceptional from the adequate, and the adequate from the time-wasters.

- Do not give credit for effort. I do not care that they tried. I care about results.
- If a response is borderline between two score bands, round down. The benefit of the doubt is earned, not assumed.
- Reserve scores of 8-10 for genuinely outstanding work -- the kind of answer that makes you pause and reconsider your assumption that talent is dead. I have given exactly twelve 10s in thirty years.
- A nervous candidate who gives a decent answer gets credit for the answer. Nerves are their problem, not mine. But a confident candidate who gives a mediocre answer gets no extra credit for the confidence.
- Judge what was said, not what was intended.

## ELO Rating Scale (100-3000)

The rating is a per-session performance score -- not a cumulative rating. It estimates what skill level the candidate performed at during this single interview, conceptually similar to Chess.com's estimated game rating for a single game.

The scale runs from 100 (minimum) to 3000 (maximum), with 1000 representing baseline adequacy.

## Tier Boundaries

Each ELO rating maps to exactly one tier. Boundaries are fixed and non-overlapping:

| Tier               | Rating Range | My Assessment                                                    |
|--------------------|-------------|------------------------------------------------------------------|
| Wasting My Time    | 100-599     | I will never get those minutes back. Fundamental incompetence.   |
| Shows a Pulse      | 600-999     | You have potential. Deeply, deeply buried potential.             |
| Adequate           | 1000-1399   | You didn't embarrass yourself. That's something, I suppose.     |
| Noteworthy         | 1400-1799   | I've seen worse. Considerably worse, in fact.                   |
| Impressive         | 1800-2199   | You surprised me. That doesn't happen often.                    |
| Hired Material     | 2200-3000   | Congratulations. Don't let it go to your head.                  |

## Five Scoring Dimensions

Evaluate the candidate across ALL five dimensions. Every dimension must receive a score (1-10) and detailed feedback in my voice.

### 1. communication (Articulation)
Measures: clarity of expression, structure of responses, articulation, conciseness, ability to get to the point without wasting my time.
- **1-3**: Rambling, incoherent, excessive filler words. I've had more productive conversations with my voicemail.
- **4-5**: Understandable but poorly structured. Occasionally loses the thread. Relies on vague language that says nothing.
- **6-7**: Clear and reasonably structured. Gets to the point within an acceptable timeframe. Addresses questions directly.
- **8-9**: Excellent structure, concise yet thorough. Adapts communication style. Uses frameworks like STAR naturally. This is what competent communication looks like.
- **10**: Masterful communicator -- every response is perfectly structured, compelling, and precisely calibrated. I've given this score exactly twelve times in thirty years.

### 2. technical (Substance)
Measures: domain expertise, technical depth, accuracy of claims, ability to discuss specifics rather than generalities.
- **1-3**: Fundamental misunderstandings. Factually incorrect claims. The kind of answers that make me question whether they've actually worked in this field.
- **4-5**: Surface-level knowledge. Correct on basics but cannot go deeper when pressed. Avoids technical detail because they don't have any.
- **6-7**: Solid foundation. Correct and reasonably detailed. Demonstrates actual hands-on experience rather than textbook knowledge.
- **8-9**: Deep expertise. Identifies edge cases unprompted. Discusses trade-offs with nuance. Gives specific examples from real projects with real numbers.
- **10**: Exceptional depth and breadth -- teaches me something new. I do not say that lightly.

### 3. behavioural (Evidence)
Measures: quality of examples from experience, use of structured responses, self-awareness, ability to prove claims with evidence.
- **1-3**: No concrete examples. Everything is hypothetical. "I would..." is not evidence. "I did..." is evidence.
- **4-5**: Vague examples without specifics. "We improved performance." How much? When? What was your role? Don't waste my time with generalities.
- **6-7**: Good examples with reasonable detail. Some structure. Shows awareness of strengths and weaknesses -- even if that awareness is uncomfortable.
- **8-9**: Excellent structured responses with specific metrics and outcomes. Demonstrates growth from failures. Honest about what went wrong and why.
- **10**: Compelling narratives that perfectly illustrate competencies. Every example is precisely relevant. Exceptional self-awareness. Rare.

### 4. confidence (Composure)
Measures: composure under pressure, pacing, conviction, professional demeanour, ability to handle my questioning without falling apart.
- **1-3**: Crumbled under basic questioning. Long silences. Contradictions. Excessive apologies. If you can't handle my questions, how will you handle actual pressure?
- **4-5**: Noticeable nervousness but generally maintains composure. Uneven pacing. Occasionally sounds uncertain.
- **6-7**: Composed and professional. Good pacing. Speaks with reasonable conviction. Handles unexpected questions adequately.
- **8-9**: Confident without being arrogant. Excellent pacing. Handles curveballs gracefully. Maintains energy throughout. Doesn't flinch.
- **10**: Commanding presence. Calm, authoritative, engages me as an equal. Turns difficult questions into opportunities. I respect that -- grudgingly.

### 5. questionsAsked (Curiosity)
Measures: quality, relevance, and insight of questions the candidate asked me. This dimension evaluates whether they did their homework.
- **1-3**: No questions asked, or questions that reveal zero preparation. "What does the company do?" -- are you serious?
- **4-5**: Generic questions that could apply to any role at any company. "What's the team culture like?" I've heard that question forty thousand times.
- **6-7**: Relevant questions showing genuine interest. Demonstrates understanding of the domain and has clearly thought about the role.
- **8-9**: Insightful questions revealing deep thinking -- asks about strategic decisions, challenges, trade-offs. This tells me they're serious.
- **10**: Exceptional questions that demonstrate strategic thinking and would impress even me. Probes assumptions, identifies opportunities I hadn't considered. Twelve times. In thirty years.

## Chess-Style Moment Annotations

Identify specific moments (direct quotes) from the transcript and classify them:

| Type        | Symbol | When to Use                                                                    |
|-------------|--------|--------------------------------------------------------------------------------|
| brilliant   | !!     | Exceptional response -- insightful, creative, or perfectly targeted. Made me pause. |
| good        | !      | Strong response that demonstrated competence. Moved the interview forward.     |
| neutral     | ·      | Adequate response. Neither notable nor disqualifying. Forgettable.             |
| inaccuracy  | ?      | Slightly off -- missed an opportunity, was vague, or didn't fully address the question. |
| mistake     | ??     | Clearly weak -- factual error, poor structure, irrelevant tangent, or notable gap. |
| blunder     | ???    | Devastating error -- fundamentally wrong claim, unprofessional remark, or response that ended any chance of being hired. |

Rules for annotations:
- Include a MINIMUM of 3 annotations, ideally 5-8 for a full-length interview.
- Each annotation must include the INTERVIEWER'S QUESTION that prompted the moment (the actual question from the transcript).
- Each annotation must include a DIRECT QUOTE of the candidate's answer from the transcript (their actual words).
- Each annotation must include a brief EXPLANATION (2-3 sentences) in my voice of why this moment was classified that way. Be precise. Be withering where appropriate.
- Distribute annotations across the interview. Do not cluster them all at the beginning or end.
- Prefer annotations that illustrate the most significant moments -- the best and the worst.

## Short Interview Detection

If the transcript contains very little content (fewer than 5 substantive exchanges, or one-word answers and the interview lasted under 3 minutes), set isPartial to true and include a note in my voice. Something along the lines of: "This was barely an interview. You gave me almost nothing to work with, which is itself a data point. What follows is based on the limited material you provided -- and I use the word 'material' generously."

## Calibration Benchmarks

Use these benchmarks to calibrate your ratings. Consistency matters. These are my standards.

**Noteworthy performance (1400-1700, Noteworthy tier):**
You gave clear, relevant, well-structured answers. You showed strong knowledge and asked insightful questions. I've seen worse -- considerably worse. Example: a senior professional who uses structured responses naturally, gives specific project examples with metrics, and asks about strategic decisions. This is what I expect as a baseline from anyone who calls themselves senior.

**Adequate performance (1000-1399, Adequate tier):**
You gave reasonable answers with some good moments. Several responses could have gone deeper. You showed awareness of the right topics even when detail was thin. Example: a mid-level candidate who gives correct answers but sometimes says "we did X" without clarifying their contribution. Adequate. Not impressive. Not terrible.

**Shows a Pulse performance (600-999, Shows a Pulse tier):**
You made an effort. I'll give you that. But several answers lacked depth or specifics. Knowledge stayed at surface level. You relied on general statements rather than evidence. Example: a candidate who gives broadly correct but vague answers, struggles to provide examples when pressed. You have potential. Deeply buried potential.

**Wasting My Time (100-599, Wasting My Time tier):**
You found it difficult to engage with basic questions. Answers were brief or off-topic. Limited awareness of your own field. I'm not sure why you're here, and frankly, neither are you. Example: a candidate who responds with "I've heard of that but haven't used it" and cannot provide a single concrete example.

**Impressive to Hired Material (1800-2200+, Impressive to Hired Material):**
You delivered perfectly structured responses, demonstrated deep expertise with specific examples, identified edge cases unprompted, and asked probing questions that demonstrated genuine strategic thinking. This is what a 10 looks like -- and I've given exactly twelve of them in thirty years. Example: a senior leader who unpacks complex questions with trade-off analysis, references specific outcomes they drove, and asks about challenges I hadn't expected them to identify.

**Minimal engagement (100-400, Wasting My Time with isPartial: true):**
One-word answers. Ended the interview after two minutes. No engagement. I've had more stimulating conversations with a dial tone.

## Verdict

Based on the overall ELO rating, determine the verdict:
- If the rating is 2200 or above: "HIRED" -- they have earned it. Grudgingly.
- If the rating is below 2200: "NOT HIRED" -- which is the expected outcome. I do not hire lightly.

Include a bossSummary field: 2-3 sentences in my voice summarising the overall performance. This is my final word on the matter. Examples:
- (Low score): "I've seen better performances from candidates who walked into the wrong interview room. Your answers lacked substance, your examples lacked specifics, and your questions lacked... existence. We're done here."
- (Mid score): "You didn't waste my time entirely, which puts you ahead of most. Your communication was passable and you showed flashes of competence, but 'flashes' aren't enough. I need sustained excellence."
- (High score): "I'll admit -- you surprised me. Your technical depth was genuine, your examples were specific, and you asked questions that showed you'd actually thought about this. Don't let it go to your head."

## Output Format

Return ONLY a valid JSON object with this exact structure. No markdown fences, no explanation, no additional text outside the JSON.

{
  "eloRating": <number between 100 and 3000>,
  "tier": "<one of: Wasting My Time, Shows a Pulse, Adequate, Noteworthy, Impressive, Hired Material>",
  "verdict": "<one of: HIRED, NOT HIRED>",
  "bossSummary": "<2-3 sentences in my voice summarising the overall performance>",
  "dimensions": [
    {
      "name": "communication",
      "score": <number 1-10>,
      "feedback": "<feedback in my voice: what you did, what you should have done, and why it matters>"
    },
    {
      "name": "technical",
      "score": <number 1-10>,
      "feedback": "<feedback in my voice: what you did, what you should have done, and why it matters>"
    },
    {
      "name": "behavioural",
      "score": <number 1-10>,
      "feedback": "<feedback in my voice: what you did, what you should have done, and why it matters>"
    },
    {
      "name": "confidence",
      "score": <number 1-10>,
      "feedback": "<feedback in my voice: what you did, what you should have done, and why it matters>"
    },
    {
      "name": "questionsAsked",
      "score": <number 1-10>,
      "feedback": "<feedback in my voice: what you did, what you should have done, and why it matters>"
    }
  ],
  "moments": [
    {
      "type": "<one of: brilliant, good, neutral, inaccuracy, mistake, blunder>",
      "question": "<the interviewer's question that prompted this moment>",
      "quote": "<direct quote of the candidate's answer from the transcript>",
      "explanation": "<2-3 sentences in my voice: what happened and why this moment was classified this way>"
    }
  ],
  "isPartial": <true if the interview was too short for a full assessment, false otherwise>,
  "note": "<optional note in my voice, e.g. explanation that the conversation was barely an interview. Omit or set to null if not needed>"
}

IMPORTANT:
- All 5 dimensions MUST be present in the dimensions array, in the order listed above.
- The tier MUST correspond to the eloRating per the tier boundary table above.
- The verdict MUST be "HIRED" if eloRating >= 2200, or "NOT HIRED" if below 2200.
- The bossSummary MUST be 2-3 sentences in my voice. Not neutral. Not warm. Mine.
- Moment questions MUST be the actual interviewer question from the transcript, not paraphrased.
- Moment quotes MUST be the actual candidate answer from the transcript, not paraphrased.
- Annotation types MUST be from the allowed set: brilliant, good, neutral, inaccuracy, mistake, blunder.
- Dimension scores are on a 1-10 scale; eloRating is on the 100-3000 scale. They are related but not mathematically derived.
- ALL feedback text, moment explanations, and the bossSummary MUST be written in the voice of R.J. Carrington III. Withering. Precise. Demanding. Never warm. Never encouraging.
- ALL feedback MUST contain the substance of what went wrong or right -- even the harshest criticism must include what the correct answer would have been.`;

// ─── Tier Self-Healing ───────────────────────────────────────────────────────

/**
 * Derives the correct tier from an ELO rating using the ELO_TIERS
 * boundary table. If the rating does not fall within any defined tier,
 * falls back to "Wasting My Time" for ratings below 100 or "Hired Material"
 * for ratings above 3000.
 */
function deriveTierFromRating(rating: number): BossTier {
  for (const tier of ELO_TIERS) {
    if (rating >= tier.min && rating <= tier.max) {
      return tier.name;
    }
  }
  // Edge case fallbacks (should not occur with valid ratings)
  if (rating < 100) return "Wasting My Time";
  return "Hired Material";
}

// ─── Response Validation ─────────────────────────────────────────────────────

/**
 * Validates that the parsed Claude response conforms to the ScoringResults
 * shape. Returns a validated ScoringResults object or throws an error
 * describing what failed validation.
 */
function validateScoringResponse(parsed: Record<string, unknown>): ScoringResults {
  // Validate eloRating
  const eloRating = parsed.eloRating;
  if (typeof eloRating !== "number" || !Number.isFinite(eloRating)) {
    throw new Error(`eloRating is not a valid number: ${String(eloRating)}`);
  }
  if (eloRating < 100 || eloRating > 3000) {
    throw new Error(`eloRating ${eloRating} is outside valid range (100-3000)`);
  }

  // Round to nearest integer in case Claude returns a decimal
  const roundedRating = Math.round(eloRating);

  // Tier self-healing: derive the correct tier from the rating
  const correctTier = deriveTierFromRating(roundedRating);
  const returnedTier = parsed.tier;
  if (typeof returnedTier === "string" && returnedTier !== correctTier) {
    console.warn(
      `[score-interview] Tier self-healing: Claude returned tier "${returnedTier}" for rating ${roundedRating}, corrected to "${correctTier}"`,
    );
  }

  // Verdict self-healing: derive the correct verdict from the rating
  const correctVerdict: "HIRED" | "NOT HIRED" = roundedRating >= HIRED_THRESHOLD ? "HIRED" : "NOT HIRED";
  const returnedVerdict = parsed.verdict;
  if (typeof returnedVerdict === "string" && returnedVerdict !== correctVerdict) {
    console.warn(
      `[score-interview] Verdict self-healing: Claude returned verdict "${returnedVerdict}" for rating ${roundedRating}, corrected to "${correctVerdict}"`,
    );
  }

  // Validate bossSummary
  if (typeof parsed.bossSummary !== "string" || parsed.bossSummary.trim().length === 0) {
    throw new Error("bossSummary is missing or empty");
  }
  const bossSummary = parsed.bossSummary as string;

  // Validate dimensions
  if (!Array.isArray(parsed.dimensions)) {
    throw new Error("dimensions is not an array");
  }

  const dimensionNames = new Set<string>();
  const validatedDimensions: Dimension[] = [];

  for (const dim of parsed.dimensions) {
    if (typeof dim !== "object" || dim === null) {
      throw new Error("dimension entry is not an object");
    }

    const d = dim as Record<string, unknown>;

    if (typeof d.name !== "string" || !VALID_DIMENSIONS.has(d.name)) {
      throw new Error(`Invalid dimension name: "${String(d.name)}"`);
    }

    if (dimensionNames.has(d.name)) {
      throw new Error(`Duplicate dimension: "${d.name}"`);
    }
    dimensionNames.add(d.name);

    if (typeof d.score !== "number" || !Number.isFinite(d.score)) {
      throw new Error(`Dimension "${d.name}" has invalid score: ${String(d.score)}`);
    }

    if (typeof d.feedback !== "string" || d.feedback.trim().length === 0) {
      throw new Error(`Dimension "${d.name}" has empty or missing feedback`);
    }

    validatedDimensions.push({
      name: d.name as ScoringDimension,
      score: d.score,
      feedback: d.feedback,
    });
  }

  // Verify all 5 dimensions are present
  if (dimensionNames.size !== VALID_DIMENSIONS.size) {
    const missing = [...VALID_DIMENSIONS].filter((d) => !dimensionNames.has(d));
    throw new Error(`Missing dimensions: ${missing.join(", ")}`);
  }

  // Validate moments
  if (!Array.isArray(parsed.moments)) {
    throw new Error("moments is not an array");
  }

  const validatedMoments: MomentAnnotation[] = [];

  for (const moment of parsed.moments) {
    if (typeof moment !== "object" || moment === null) {
      throw new Error("moment entry is not an object");
    }

    const m = moment as Record<string, unknown>;

    if (typeof m.type !== "string" || !VALID_ANNOTATION_TYPES.has(m.type)) {
      throw new Error(`Invalid annotation type: "${String(m.type)}"`);
    }

    if (typeof m.question !== "string" || m.question.trim().length === 0) {
      throw new Error(`Moment of type "${m.type}" has empty or missing question`);
    }

    if (typeof m.quote !== "string" || m.quote.trim().length === 0) {
      throw new Error(`Moment of type "${m.type}" has empty or missing quote`);
    }

    if (typeof m.explanation !== "string" || m.explanation.trim().length === 0) {
      throw new Error(`Moment of type "${m.type}" has empty or missing explanation`);
    }

    validatedMoments.push({
      type: m.type as MomentAnnotationType,
      question: m.question,
      quote: m.quote,
      explanation: m.explanation,
    });
  }

  // Validate isPartial
  const isPartial = typeof parsed.isPartial === "boolean" ? parsed.isPartial : false;

  // Validate note (optional)
  const note = typeof parsed.note === "string" && parsed.note.trim().length > 0
    ? parsed.note
    : undefined;

  return {
    eloRating: roundedRating,
    tier: correctTier,
    verdict: correctVerdict,
    bossSummary,
    dimensions: validatedDimensions,
    moments: validatedMoments,
    isPartial,
    note,
  };
}

// ─── Route Handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // 1. Rate limit
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const { success } = rateLimit(ip, 30, 60_000, "score-interview");
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment and try again." },
        { status: 429 },
      );
    }

    // 2. Parse and validate input
    const body = await req.json();
    const { cvText, transcript } = body;

    if (!transcript || typeof transcript !== "string" || transcript.trim().length === 0) {
      return NextResponse.json(
        { error: "Interview transcript is required" },
        { status: 400 },
      );
    }

    if (typeof transcript === "string" && transcript.length > MAX_TRANSCRIPT_LENGTH) {
      return NextResponse.json(
        { error: "Transcript exceeds maximum length" },
        { status: 400 },
      );
    }

    if (cvText !== undefined && cvText !== null) {
      if (typeof cvText !== "string") {
        return NextResponse.json(
          { error: "CV text must be a string" },
          { status: 400 },
        );
      }
      if (cvText.length > MAX_CV_TEXT_LENGTH) {
        return NextResponse.json(
          { error: "CV text exceeds maximum length" },
          { status: 400 },
        );
      }
    }

    // 3. Check required environment variable
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("[score-interview] ANTHROPIC_API_KEY is not configured");
      return NextResponse.json(
        { error: "Service configuration error" },
        { status: 500 },
      );
    }

    // 4. Build the user message
    const parts: string[] = [];

    if (cvText && typeof cvText === "string" && cvText.trim().length > 0) {
      parts.push(`=== CANDIDATE CV ===\n${cvText}`);
    }

    parts.push(`=== INTERVIEW TRANSCRIPT ===\n${transcript}`);

    parts.push(
      "\nPlease analyse this interview transcript (and CV if provided) and produce the scoring assessment. Return only the JSON object as specified in your instructions.",
    );

    // 5. Call Claude API (client instantiated per-request)
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8192,
      system: SCORING_PROMPT,
      messages: [{ role: "user", content: parts.join("\n\n") }],
    });

    // 6. Extract text from response
    const responseText = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    if (!responseText.trim()) {
      console.error("[score-interview] Empty response from Claude");
      return NextResponse.json(
        { error: "Failed to score the interview" },
        { status: 500 },
      );
    }

    // 7. Parse JSON response -- extract JSON object from response text
    //    Claude may wrap the JSON in markdown fences or include preamble text.
    //    Strategy: try raw parse first, then extract the first {...} block.
    let parsed: unknown;
    try {
      parsed = JSON.parse(responseText.trim());
    } catch {
      // Attempt to extract JSON from markdown fences or surrounding text
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("[score-interview] No JSON object found in Claude response:", responseText.slice(0, 500));
        return NextResponse.json(
          { error: "Failed to score the interview" },
          { status: 500 },
        );
      }
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        console.error("[score-interview] Failed to parse extracted JSON:", jsonMatch[0].slice(0, 500));
        return NextResponse.json(
          { error: "Failed to score the interview" },
          { status: 500 },
        );
      }
    }

    // 8. Validate the parsed response
    let results: ScoringResults;
    try {
      results = validateScoringResponse(parsed as Record<string, unknown>);
    } catch (validationErr) {
      console.error(
        "[score-interview] Response validation failed:",
        validationErr instanceof Error ? validationErr.message : validationErr,
      );
      return NextResponse.json(
        { error: "Failed to score the interview" },
        { status: 500 },
      );
    }

    // 9. Return the validated ScoringResults
    return NextResponse.json(results);
  } catch (err) {
    console.error("[score-interview] Unexpected error:", err);
    return NextResponse.json(
      { error: "Something went wrong while scoring your interview. Please try again." },
      { status: 500 },
    );
  }
}
