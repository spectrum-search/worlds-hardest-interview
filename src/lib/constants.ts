/**
 * Application-wide constants for The World's Hardest Job Interview.
 *
 * Centralises configuration values, step definitions, tier boundaries,
 * and character length limits used across components and API routes.
 *
 * Adapted from interview-elo with the following changes:
 * - STEP_ORDER: 5 steps starting with "landing" (removed provide-jd and briefing)
 * - STEP_LABELS: adapted labels for the 5-step flow
 * - ELO_TIERS: boss-themed tier names, same boundaries and colours
 * - HIRED_THRESHOLD: new constant (2200) defining the HIRED verdict boundary
 * - MAX_JD_TEXT_LENGTH: removed (no JD processing in this project)
 */

import type { WizardStep, EloTierDefinition } from "./types";

/** ElevenLabs agent ID, read from environment with empty-string fallback */
export const AGENT_ID =
  process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID ?? "";

/** Wizard steps in their canonical display order */
export const STEP_ORDER: WizardStep[] = [
  "landing",
  "upload-cv",
  "interview",
  "analysis",
  "results",
];

/** User-facing labels for each wizard step */
export const STEP_LABELS: Record<WizardStep, string> = {
  "landing": "Welcome",
  "upload-cv": "Upload CV",
  "interview": "Interview",
  "analysis": "Analysis",
  "results": "Results",
} as const;

/**
 * ELO tier definitions with rating boundaries and colours.
 * Tiers are ordered from lowest to highest. Boundaries are inclusive
 * on both ends (e.g. "Wasting My Time" covers 100–599).
 * Tier names adapted to the boss's voice; boundaries and colours
 * identical to interview-elo.
 */
export const ELO_TIERS: EloTierDefinition[] = [
  { name: "Wasting My Time", min: 100, max: 599, colour: "var(--color-error)" },
  { name: "Shows a Pulse", min: 600, max: 999, colour: "var(--color-warning-strong)" },
  { name: "Adequate", min: 1000, max: 1399, colour: "var(--color-warning)" },
  { name: "Noteworthy", min: 1400, max: 1799, colour: "var(--color-success)" },
  { name: "Impressive", min: 1800, max: 2199, colour: "var(--color-accent)" },
  { name: "Hired Material", min: 2200, max: 3000, colour: "var(--color-elite)" },
];

/** Maximum character length for extracted CV text (post-extraction) */
export const MAX_CV_TEXT_LENGTH = 100_000;

/** Maximum character length for transcript sent to scoring */
export const MAX_TRANSCRIPT_LENGTH = 200_000;

/**
 * The ELO rating threshold at or above which the verdict becomes "HIRED".
 * Below this threshold, the verdict is "NOT HIRED".
 */
export const HIRED_THRESHOLD = 2200;
