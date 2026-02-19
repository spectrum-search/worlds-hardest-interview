"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useSpring, useTransform } from "framer-motion";
import {
  getTransition,
  getVariants,
  springs,
  staggerContainer,
} from "@/lib/motion";
import { ELO_TIERS } from "@/lib/constants";
import {
  MOMENT_SYMBOLS,
  MOMENT_LABELS,
  DIMENSION_LABELS,
} from "@/lib/types";
import type {
  ScoringResults,
  TranscriptEntry,
  MomentAnnotationType,
} from "@/lib/types";

import SocialShare from "@/components/SocialShare";

// ─── Props ──────────────────────────────────────────────────────────────────────

export interface ResultsStepProps {
  /** Complete scoring results including verdict and bossSummary */
  results: ScoringResults;
  /** Interview transcript for the collapsible transcript section */
  transcript: TranscriptEntry[];
  /** Called when user clicks "Face R.J. Carrington Again" (retry) */
  onTryAgain: () => void;
  /** Called when user clicks "Start Over" (full reset) */
  onStartOver: () => void;
  /** Whether the user prefers reduced motion */
  prefersReducedMotion: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

/** The boss character name used in chat bubbles and labels */
const BOSS_NAME = "R.J. Carrington III";

/** The app URL for social sharing */
const APP_URL = "https://interview.taluna.io";

// ─── Utility Functions ──────────────────────────────────────────────────────────

/** Strips ElevenLabs voice annotations like [direct], [slow], [lips smack] from text */
function stripVoiceTags(text: string): string {
  return text.replace(/\[[\w\s]+\]\s*/g, "").trim();
}

/** Returns the colour for a given annotation type */
function getMomentColour(type: MomentAnnotationType): string {
  switch (type) {
    case "brilliant":
      return "var(--color-accent)";
    case "good":
      return "var(--color-success)";
    case "neutral":
      return "var(--color-text-secondary)";
    case "inaccuracy":
      return "var(--color-warning)";
    case "mistake":
      return "var(--color-warning-strong)";
    case "blunder":
      return "var(--color-error)";
  }
}

/** Returns the tier colour for a given ELO rating */
function getTierColour(rating: number): string {
  const tier = ELO_TIERS.find((t) => rating >= t.min && rating <= t.max);
  return tier?.colour ?? "var(--color-text-secondary)";
}

/** Returns the colour for a dimension score (1–10 scale) */
function getScoreColour(score: number): string {
  if (score <= 3) return "var(--color-error)";
  if (score <= 5) return "var(--color-warning-strong)";
  if (score <= 7) return "var(--color-warning)";
  if (score <= 9) return "var(--color-success)";
  return "var(--color-elite)";
}

// ─── Sub-Components ─────────────────────────────────────────────────────────────

/** Animated counter component for the ELO rating */
function AnimatedEloCounter({
  value,
  prefersReducedMotion,
}: {
  value: number;
  prefersReducedMotion: boolean;
}) {
  const springValue = useSpring(0, {
    stiffness: 50,
    damping: 20,
    duration: prefersReducedMotion ? 0.01 : 1.5,
  });
  const displayValue = useTransform(springValue, (latest) =>
    Math.round(latest),
  );
  const [rendered, setRendered] = useState(prefersReducedMotion ? value : 0);

  useEffect(() => {
    if (prefersReducedMotion) {
      setRendered(value);
      return;
    }

    springValue.set(value);

    const unsubscribe = displayValue.on("change", (latest) => {
      setRendered(latest);
    });

    // Read current value in case the spring has already settled (e.g. after
    // React strict mode re-mount where the first subscription was cleaned up)
    setRendered(Math.round(springValue.get()));

    return () => unsubscribe();
  }, [value, prefersReducedMotion, springValue, displayValue]);

  return (
    <span
      className="font-rubik text-6xl font-bold tabular-nums sm:text-7xl md:text-8xl"
      style={{ color: getTierColour(value) }}
      aria-label={`ELO rating: ${value}`}
    >
      {rendered}
    </span>
  );
}

/** Expandable dimension card */
function DimensionCard({
  name,
  score,
  feedback,
  prefersReducedMotion,
}: {
  name: string;
  score: number;
  feedback: string;
  prefersReducedMotion: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = `dimension-${name.replace(/\s+/g, "-").toLowerCase()}`;
  const scoreColour = getScoreColour(score);

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg-elevated)",
      }}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="cursor-pointer flex w-full items-center justify-between px-4 py-3 text-left transition-colors sm:px-5 sm:py-4"
        style={{
          transitionDuration: "150ms",
          transitionTimingFunction: "cubic-bezier(0.25, 0.1, 0.25, 1)",
        }}
        aria-expanded={isExpanded}
        aria-controls={contentId}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-text-primary sm:text-base">
            {name}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Score circle */}
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold tabular-nums text-white"
            style={{ backgroundColor: scoreColour }}
            aria-label={`Score: ${score} out of 10`}
          >
            {score}
          </span>

          {/* Chevron */}
          <motion.svg
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={getTransition(prefersReducedMotion, {
              duration: 0.2,
              ease: [0.25, 0.1, 0.25, 1],
            })}
            className="h-4 w-4 text-text-secondary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </motion.svg>
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            id={contentId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={getTransition(prefersReducedMotion, {
              duration: 0.25,
              ease: [0.25, 0.1, 0.25, 1],
            })}
            className="overflow-hidden"
          >
            <div
              className="border-t px-4 py-3 sm:px-5 sm:py-4"
              style={{ borderColor: "var(--color-border)" }}
            >
              <p className="text-sm leading-relaxed text-text-secondary">
                {feedback}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function ResultsStep({
  results,
  transcript,
  onTryAgain,
  onStartOver,
  prefersReducedMotion,
}: ResultsStepProps) {
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(false);
  const verdictRef = useRef<HTMLDivElement>(null);

  // Scroll to top on mount so the verdict banner is visible
  useEffect(() => {
    verdictRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Find the current tier position on the scale
  const totalRange = ELO_TIERS[ELO_TIERS.length - 1].max - ELO_TIERS[0].min;
  const ratingPosition =
    ((results.eloRating - ELO_TIERS[0].min) / totalRange) * 100;
  const clampedPosition = Math.max(0, Math.min(100, ratingPosition));

  const isHired = results.verdict === "HIRED";

  // Stagger item variant
  const itemVariant = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      {...getVariants(prefersReducedMotion, {
        initial: { opacity: 0, y: 8, filter: "blur(4px)" },
        animate: { opacity: 1, y: 0, filter: "blur(0)" },
        exit: { opacity: 0, scale: 0.98, filter: "blur(2px)" },
      })}
      transition={getTransition(prefersReducedMotion, springs.snappy)}
    >
      {/* ── Verdict Banner ────────────────────────────────────────────────── */}
      <motion.div
        ref={verdictRef}
        initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={getTransition(prefersReducedMotion, springs.bouncy)}
        className="mb-6 flex flex-col items-center rounded-xl border-2 px-6 py-6 text-center sm:py-8"
        style={{
          borderColor: isHired ? "var(--color-success)" : "var(--color-error)",
          backgroundColor: isHired
            ? "rgba(21, 135, 95, 0.06)"
            : "rgba(239, 68, 68, 0.06)",
        }}
        role="status"
        aria-live="polite"
      >
        <h2
          className="font-rubik text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl"
          style={{ color: isHired ? "var(--color-success)" : "var(--color-error)" }}
          tabIndex={-1}
        >
          {results.verdict}
        </h2>
      </motion.div>

      {/* ── Boss's Summary ────────────────────────────────────────────────── */}
      <motion.div
        initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={getTransition(prefersReducedMotion, {
          ...springs.snappy,
          delay: prefersReducedMotion ? 0 : 0.15,
        })}
        className="mb-8 text-center"
      >
        <p className="text-base leading-relaxed text-text-secondary italic sm:text-lg">
          "{results.bossSummary}"
        </p>
        <p
          className="mt-2 text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--color-accent)" }}
        >
          — {BOSS_NAME}
        </p>
      </motion.div>

      {/* ── ELO Rating Section ────────────────────────────────────────────── */}
      <motion.div
        variants={prefersReducedMotion ? undefined : staggerContainer}
        initial="initial"
        animate="animate"
        className="flex flex-col items-center"
      >
        {/* ELO counter */}
        <motion.div
          variants={prefersReducedMotion ? undefined : itemVariant}
          transition={getTransition(prefersReducedMotion, springs.snappy)}
          className="text-center"
        >
          <AnimatedEloCounter
            value={results.eloRating}
            prefersReducedMotion={prefersReducedMotion}
          />
        </motion.div>

        {/* Tier badge */}
        <motion.div
          variants={prefersReducedMotion ? undefined : itemVariant}
          transition={getTransition(prefersReducedMotion, {
            ...springs.snappy,
            delay: 0.2,
          })}
          className="mt-3"
        >
          <span
            className="inline-block rounded-full px-4 py-1.5 text-sm font-semibold text-white"
            style={{
              backgroundColor: getTierColour(results.eloRating),
            }}
          >
            {results.tier}
          </span>
        </motion.div>

        {/* Tier scale bar */}
        <motion.div
          variants={prefersReducedMotion ? undefined : itemVariant}
          transition={getTransition(prefersReducedMotion, {
            ...springs.snappy,
            delay: 0.3,
          })}
          className="mt-6 w-full max-w-md"
        >
          {/* Tier labels */}
          <div className="mb-2 flex justify-between">
            {ELO_TIERS.map((tier) => (
              <span
                key={tier.name}
                className="hidden text-center text-[10px] font-medium sm:block"
                style={{
                  color:
                    results.tier === tier.name
                      ? tier.colour
                      : "var(--color-text-secondary)",
                  flex: `${tier.max - tier.min} 0 0`,
                }}
              >
                {tier.name}
              </span>
            ))}
          </div>

          {/* Scale bar */}
          <div className="relative h-3 overflow-hidden rounded-full" style={{ backgroundColor: "var(--color-bg-muted)" }}>
            <div className="flex h-full">
              {ELO_TIERS.map((tier) => (
                <div
                  key={tier.name}
                  className="h-full"
                  style={{
                    backgroundColor: tier.colour,
                    flex: `${tier.max - tier.min} 0 0`,
                    opacity: 0.25,
                  }}
                />
              ))}
            </div>

            {/* Rating marker */}
            <motion.div
              className="absolute top-0 h-full w-1 rounded-full"
              style={{
                backgroundColor: getTierColour(results.eloRating),
                boxShadow: `0 0 6px ${getTierColour(results.eloRating)}`,
              }}
              initial={{ left: "0%" }}
              animate={{ left: `${clampedPosition}%` }}
              transition={getTransition(prefersReducedMotion, {
                type: "spring" as const,
                duration: 1.2,
                bounce: 0.15,
                delay: prefersReducedMotion ? 0 : 0.8,
              })}
            />
          </div>

          {/* Min / Max labels */}
          <div className="mt-1 flex justify-between">
            <span className="text-[10px] text-text-secondary">100</span>
            <span className="text-[10px] text-text-secondary">3000</span>
          </div>
        </motion.div>
      </motion.div>

      {/* ── Scoring Dimensions ────────────────────────────────────────────── */}
      <div className="mt-10">
        <h3 className="font-rubik text-lg font-bold text-text-primary sm:text-xl">
          How you came across
        </h3>
        <div className="mt-4 space-y-2">
          {results.dimensions.map((dim) => (
            <DimensionCard
              key={dim.name}
              name={DIMENSION_LABELS[dim.name]}
              score={dim.score}
              feedback={dim.feedback}
              prefersReducedMotion={prefersReducedMotion}
            />
          ))}
        </div>
      </div>

      {/* ── Key Moments ───────────────────────────────────────────────────── */}
      {results.moments.length > 0 && (
        <div className="mt-10">
          <h3 className="font-rubik text-lg font-bold text-text-primary sm:text-xl">
            Moments that stood out
          </h3>
          <div className="mt-4 space-y-4">
            {results.moments.map((moment, index) => (
              <motion.div
                key={index}
                initial={
                  prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 6 }
                }
                animate={{ opacity: 1, y: 0 }}
                transition={getTransition(prefersReducedMotion, {
                  ...springs.snappy,
                  delay: prefersReducedMotion ? 0 : index * 0.05,
                })}
                className="rounded-xl border p-4 sm:p-5"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-bg-muted)",
                }}
              >
                {/* Annotation badge */}
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className="text-lg font-bold"
                    style={{ color: getMomentColour(moment.type) }}
                    aria-hidden="true"
                  >
                    {MOMENT_SYMBOLS[moment.type]}
                  </span>
                  <span
                    className="text-sm font-semibold"
                    style={{ color: getMomentColour(moment.type) }}
                  >
                    {MOMENT_LABELS[moment.type]}
                  </span>
                </div>

                {/* Chat bubbles */}
                <div className="space-y-2">
                  {/* Boss's question — left-aligned, light bubble */}
                  {moment.question && (
                    <div className="flex justify-start">
                      <div
                        className="max-w-[85%] rounded-2xl border px-4 py-2.5 text-sm leading-relaxed"
                        style={{
                          backgroundColor: "var(--color-bg-elevated)",
                          borderColor: "var(--color-border)",
                          color: "var(--color-text-primary)",
                        }}
                      >
                        <span
                          className="mb-1 block text-[10px] font-semibold uppercase tracking-wider"
                          style={{ color: "var(--color-accent)", opacity: 0.8 }}
                        >
                          {BOSS_NAME}
                        </span>
                        {stripVoiceTags(moment.question)}
                      </div>
                    </div>
                  )}

                  {/* Candidate's answer — right-aligned, dark bubble */}
                  <div className="flex justify-end">
                    <div
                      className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed text-white"
                      style={{
                        backgroundColor: "var(--color-bg-dark)",
                        boxShadow: "var(--shadow-sm)",
                      }}
                    >
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider opacity-60">
                        You
                      </span>
                      {stripVoiceTags(moment.quote)}
                    </div>
                  </div>
                </div>

                {/* Explanation */}
                <p className="mt-5 text-sm leading-relaxed text-text-secondary">
                  {moment.explanation}
                </p>

              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* ── Social Sharing ────────────────────────────────────────────────── */}
      <div className="mt-10 flex justify-center">
        <SocialShare
          score={results.eloRating}
          verdict={results.verdict}
          appUrl={APP_URL}
        />
      </div>

      {/* ── Collapsible Transcript ────────────────────────────────────────── */}
      <div className="mt-10">
        <div
          className="rounded-lg border overflow-hidden"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-bg-elevated)",
          }}
        >
          <button
            onClick={() => setIsTranscriptExpanded(!isTranscriptExpanded)}
            className="cursor-pointer flex w-full items-center justify-between px-4 py-3 text-left transition-colors sm:px-5 sm:py-4"
            style={{
              transitionDuration: "150ms",
              transitionTimingFunction: "cubic-bezier(0.25, 0.1, 0.25, 1)",
            }}
            aria-expanded={isTranscriptExpanded}
            aria-controls="transcript-content"
          >
            <h3 className="font-rubik text-lg font-bold text-text-primary">
              Our conversation
            </h3>
            <motion.svg
              animate={{ rotate: isTranscriptExpanded ? 180 : 0 }}
              transition={getTransition(prefersReducedMotion, {
                duration: 0.2,
                ease: [0.25, 0.1, 0.25, 1],
              })}
              className="h-5 w-5 text-text-secondary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </motion.svg>
          </button>

          <AnimatePresence>
            {isTranscriptExpanded && (
              <motion.div
                id="transcript-content"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={getTransition(prefersReducedMotion, {
                  duration: 0.25,
                  ease: [0.25, 0.1, 0.25, 1],
                })}
                className="overflow-hidden"
              >
                <div
                  className="border-t px-4 py-4 sm:px-5"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <div className="space-y-2">
                    {transcript.map((entry, index) => (
                      <div
                        key={index}
                        className={`flex ${entry.role === "agent" ? "justify-start" : "justify-end"}`}
                      >
                        <div
                          className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
                          style={
                            entry.role === "agent"
                              ? {
                                  backgroundColor: "var(--color-bg-muted)",
                                  border: "1px solid var(--color-border)",
                                  color: "var(--color-text-primary)",
                                }
                              : {
                                  backgroundColor: "var(--color-bg-dark)",
                                  color: "white",
                                  boxShadow: "var(--shadow-sm)",
                                }
                          }
                        >
                          <span
                            className="mb-1 block text-[10px] font-semibold uppercase tracking-wider"
                            style={
                              entry.role === "agent"
                                ? { color: "var(--color-accent)", opacity: 0.8 }
                                : { opacity: 0.6 }
                            }
                          >
                            {entry.role === "agent" ? BOSS_NAME : "You"}
                          </span>
                          {stripVoiceTags(entry.message)}
                        </div>
                      </div>
                    ))}

                    {transcript.length === 0 && (
                      <p className="text-sm text-text-secondary">
                        The transcript for our conversation isn&apos;t available.
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Action Buttons ────────────────────────────────────────────────── */}
      <div className="mt-8 flex flex-col items-center gap-4 pt-6 sm:flex-row sm:justify-center">
        <button
          onClick={onTryAgain}
          className="inline-flex w-full cursor-pointer items-center justify-center rounded-lg bg-text-primary px-4 py-2 font-inter text-sm font-medium leading-5 text-white transition-colors duration-150 hover:bg-[#333333] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2 sm:w-auto"
          style={{ transitionTimingFunction: "cubic-bezier(0.25, 0.1, 0.25, 1)" }}
        >
          Face {BOSS_NAME} Again
        </button>

        <button
          onClick={onStartOver}
          className="cursor-pointer font-inter text-base font-medium leading-[22px] text-text-primary underline transition-colors duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2"
          style={{ transitionTimingFunction: "cubic-bezier(0.25, 0.1, 0.25, 1)" }}
        >
          Start Over
        </button>
      </div>
    </motion.div>
  );
}
