"use client";

import { motion, AnimatePresence } from "framer-motion";

import { getTransition, getVariants, springs } from "@/lib/motion";
import { ANALYSIS_PHASE_LABELS } from "@/lib/types";

import type { AnalysisPhase } from "@/lib/types";

interface AnalysisStepProps {
  /** Current analysis pipeline phase (1: retrieving transcript, 2: boss reviewing, 3: deliberating) */
  phase: AnalysisPhase;
  /** Whether the user prefers reduced motion */
  prefersReducedMotion: boolean;
}

const PHASES: AnalysisPhase[] = [1, 2, 3];

export default function AnalysisStep({
  phase,
  prefersReducedMotion,
}: AnalysisStepProps) {
  return (
    <motion.div
      {...getVariants(prefersReducedMotion, {
        initial: { opacity: 0, y: 8, filter: "blur(4px)" },
        animate: { opacity: 1, y: 0, filter: "blur(0)" },
        exit: { opacity: 0, scale: 0.98, filter: "blur(2px)" },
      })}
      transition={getTransition(prefersReducedMotion, springs.snappy)}
    >
      <h2
        className="text-center font-rubik font-normal text-[30px] leading-[38px] text-text-primary"
        style={{ letterSpacing: "-0.013em" }}
        tabIndex={-1}
      >
        Analysing your interview
      </h2>
      <p className="mt-3 text-center font-inter text-base leading-[22px] text-text-tertiary">
        Please wait whilst we process your interview performance.
      </p>

      {/* Phase indicator */}
      <div
        className="mx-auto mt-12 flex max-w-sm flex-col gap-4"
        role="progressbar"
        aria-valuenow={phase}
        aria-valuemin={1}
        aria-valuemax={3}
        aria-label={`Analysis progress: ${ANALYSIS_PHASE_LABELS[phase]}`}
      >
        {PHASES.map((p) => {
          const isCompleted = p < phase;
          const isActive = p === phase;
          const isFuture = p > phase;

          return (
            <div
              key={p}
              className="flex items-center gap-4"
            >
              {/* Phase indicator circle */}
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
                <AnimatePresence mode="wait">
                  {isCompleted ? (
                    <motion.div
                      key={`completed-${p}`}
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={getTransition(
                        prefersReducedMotion,
                        springs.bouncy,
                      )}
                      className="flex h-10 w-10 items-center justify-center rounded-full"
                      style={{ backgroundColor: "var(--color-success)" }}
                    >
                      <svg
                        className="h-5 w-5 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </motion.div>
                  ) : isActive ? (
                    <motion.div
                      key={`active-${p}`}
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={getTransition(
                        prefersReducedMotion,
                        springs.snappy,
                      )}
                      className="flex h-10 w-10 items-center justify-center rounded-full"
                      style={{ backgroundColor: "var(--color-accent)" }}
                    >
                      <div
                        className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"
                        role="status"
                        aria-label={ANALYSIS_PHASE_LABELS[p]}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key={`future-${p}`}
                      className="flex h-10 w-10 items-center justify-center rounded-full"
                      style={{ backgroundColor: "var(--color-bg-muted)" }}
                    >
                      <span className="text-sm font-medium text-text-secondary">
                        {p}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Phase label */}
              <p
                className="text-sm font-medium"
                style={{
                  color: isFuture
                    ? "var(--color-text-secondary)"
                    : "var(--color-text-primary)",
                }}
              >
                {ANALYSIS_PHASE_LABELS[p]}
              </p>
            </div>
          );
        })}
      </div>

      {/* Subtle hint */}
      <p
        className="mt-10 text-center text-xs text-text-secondary"
        aria-live="polite"
      >
        This may take up to a minute...
      </p>
    </motion.div>
  );
}
