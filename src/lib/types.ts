/**
 * Shared type definitions for The World's Hardest Job Interview.
 *
 * This file is the single source of truth for all data shapes flowing
 * through the application. Every interface, union type, and display
 * constant record used across components, hooks, and API routes is
 * defined here.
 *
 * Adapted from interview-elo with the following changes:
 * - WizardStep: 5 steps (landing, upload-cv, interview, analysis, results)
 * - BossTier: replaces EloTier with boss-themed tier names
 * - ScoringResults: adds verdict and bossSummary fields
 * - WizardState: removes JD-related fields (jdText, jdFileName, preProcessedJD)
 * - WizardActions: removes JD-related methods; reset destinations updated
 * - PreProcessedJD: removed entirely (no JD processing in this project)
 * - Display labels adapted to boss character voice
 */

// ─── Union Types ───────────────────────────────────────────────────────────────

/** The 5 wizard steps in order */
export type WizardStep =
  | "landing"
  | "upload-cv"
  | "interview"
  | "analysis"
  | "results";

/**
 * The 6 boss-themed tier names.
 * Maps 1:1 to the same ELO rating ranges as interview-elo.
 */
export type BossTier =
  | "Wasting My Time"
  | "Shows a Pulse"
  | "Adequate"
  | "Noteworthy"
  | "Impressive"
  | "Hired Material";

/** The 5 scoring dimension keys */
export type ScoringDimension =
  | "communication"
  | "technical"
  | "behavioural"
  | "confidence"
  | "questionsAsked";

/** The 6 chess-style moment annotation types */
export type MomentAnnotationType =
  | "brilliant"
  | "good"
  | "neutral"
  | "inaccuracy"
  | "mistake"
  | "blunder";

/** Analysis pipeline phases (1-indexed) */
export type AnalysisPhase = 1 | 2 | 3;

// ─── Interfaces ────────────────────────────────────────────────────────────────

/**
 * A single scoring dimension with score and feedback.
 * Feedback text is written in the boss's voice (ruthless, witty, in-character).
 */
export interface Dimension {
  /** One of the 5 scoring dimension keys */
  name: ScoringDimension;
  /** Numeric score for this dimension (1–10) */
  score: number;
  /** Detailed feedback text in the boss's voice */
  feedback: string;
}

/**
 * A single chess-style moment annotation from the interview.
 * All text fields (explanation) are written in the boss's voice.
 */
export interface MomentAnnotation {
  /** The annotation classification */
  type: MomentAnnotationType;
  /** The interviewer's question that prompted this moment (actual transcript quote) */
  question: string;
  /** Direct quote of the candidate's answer from the transcript */
  quote: string;
  /** Explanation of why this moment was classified as such (boss's voice) */
  explanation: string;
}

/** A single transcript entry from ElevenLabs */
export interface TranscriptEntry {
  /** "agent" (boss) or "user" (candidate) */
  role: string;
  /** The message content */
  message: string;
  /** Time in seconds from the start of the call (optional) */
  timestamp?: number;
}

/**
 * Complete scoring results returned by the score-interview API route.
 * Compared to interview-elo: adds verdict and bossSummary fields,
 * uses BossTier instead of EloTier.
 */
export interface ScoringResults {
  /** ELO rating (100–3000) */
  eloRating: number;
  /** Boss-themed tier name corresponding to the ELO rating */
  tier: BossTier;
  /** Explicit HIRED/NOT HIRED verdict. HIRED requires ELO >= 2200. */
  verdict: "HIRED" | "NOT HIRED";
  /** 2–3 sentence summary in the boss's voice */
  bossSummary: string;
  /** Array of exactly 5 dimension assessments */
  dimensions: Dimension[];
  /** Array of 3+ moment annotations */
  moments: MomentAnnotation[];
  /** Whether the interview was too short for a full assessment */
  isPartial: boolean;
  /** Optional note from the boss (e.g. short interview explanation, in character) */
  note?: string;
}

/**
 * Complete wizard state managed by useInterviewWizard.
 * Compared to interview-elo: removed jdText, jdFileName, preProcessedJD.
 * Initial step is "landing" instead of "upload-cv".
 */
export interface WizardState {
  /** Current wizard step */
  step: WizardStep;
  /** Extracted CV text (null if not uploaded or skipped) */
  cvText: string | null;
  /** Original CV file name (null if not uploaded or skipped) */
  cvFileName: string | null;
  /** ElevenLabs conversation ID (null until interview starts) */
  conversationId: string | null;
  /** Interview transcript entries (null until analysis completes) */
  transcript: TranscriptEntry[] | null;
  /** Scoring results (null until analysis completes) */
  results: ScoringResults | null;
  /** Current analysis pipeline phase (null when not in analysis) */
  analysisPhase: AnalysisPhase | null;
  /** Error message to display (null when no error) */
  error: string | null;
  /** Whether a loading operation is in progress */
  loading: boolean;
}

/**
 * Stable action functions returned by useInterviewWizard.
 * Compared to interview-elo: removed setJdText, setJdFileName, setPreProcessedJD.
 * resetForRetry goes to "interview" step (not "briefing").
 * resetFull goes to "landing" step (not "upload-cv").
 */
export interface WizardActions {
  /** Set the current step. Automatically clears errors. */
  setStep: (step: WizardStep) => void;
  /** Set the extracted CV text */
  setCvText: (text: string | null) => void;
  /** Set the original CV file name */
  setCvFileName: (name: string | null) => void;
  /** Set the ElevenLabs conversation ID */
  setConversationId: (id: string | null) => void;
  /** Set the transcript entries */
  setTranscript: (entries: TranscriptEntry[] | null) => void;
  /** Set the scoring results */
  setResults: (results: ScoringResults | null) => void;
  /** Set the current analysis phase */
  setAnalysisPhase: (phase: AnalysisPhase | null) => void;
  /** Set an error message */
  setError: (message: string | null) => void;
  /** Set the loading state */
  setLoading: (loading: boolean) => void;
  /** Preserves CV; clears interview state; sets step to "interview" */
  resetForRetry: () => void;
  /** Returns to initial state (step "landing", everything empty) */
  resetFull: () => void;
}

/**
 * Tier definition used in the ELO_TIERS constant array.
 * Uses BossTier instead of EloTier for the name field.
 */
export interface EloTierDefinition {
  /** Boss-themed display name of the tier */
  name: BossTier;
  /** Minimum ELO rating for this tier (inclusive) */
  min: number;
  /** Maximum ELO rating for this tier (inclusive) */
  max: number;
  /** CSS colour value for this tier (uses CSS custom properties) */
  colour: string;
}

// ─── Display Constant Records ──────────────────────────────────────────────────

/** Maps annotation types to their chess-style symbols */
export const MOMENT_SYMBOLS: Record<MomentAnnotationType, string> = {
  brilliant: "!!",
  good: "!",
  neutral: "·",
  inaccuracy: "?",
  mistake: "??",
  blunder: "???",
} as const;

/** Maps annotation types to display labels */
export const MOMENT_LABELS: Record<MomentAnnotationType, string> = {
  brilliant: "Brilliant",
  good: "Good",
  neutral: "Neutral",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
  blunder: "Blunder",
} as const;

/**
 * Maps scoring dimension keys to boss-themed display labels.
 * Internal keys remain identical to interview-elo; only the labels change.
 */
export const DIMENSION_LABELS: Record<ScoringDimension, string> = {
  communication: "Articulation",
  technical: "Substance",
  behavioural: "Evidence",
  confidence: "Composure",
  questionsAsked: "Curiosity",
} as const;

/**
 * Maps analysis phases to boss-themed user-facing progress messages.
 * Phase 1 unchanged; phases 2 and 3 adapted for the boss character.
 */
export const ANALYSIS_PHASE_LABELS: Record<AnalysisPhase, string> = {
  1: "Retrieving transcript",
  2: "The boss is reviewing your performance",
  3: "Deliberating...",
} as const;
