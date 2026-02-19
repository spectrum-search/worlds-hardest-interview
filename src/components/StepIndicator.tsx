"use client";

import { STEP_ORDER, STEP_LABELS } from "@/lib/constants";

import type { WizardStep } from "@/lib/types";

/**
 * Step progress indicator bar.
 *
 * Linear progress bar with step label text, adapted for the 5-step wizard.
 * The landing step is excluded from the indicator — page.tsx hides this
 * component entirely when on the landing step, so only 4 steps are shown:
 * Upload CV, Interview, Analysis, Results.
 *
 * Adapted from interview-elo StepIndicator with:
 * - 4 displayed steps (landing excluded) instead of 6
 * - prefersReducedMotion prop for transition control
 * - Same visual style: progress bar track with accent fill, step label
 */

interface StepIndicatorProps {
  /** Current wizard step */
  currentStep: WizardStep;
  /** Whether the user prefers reduced motion */
  prefersReducedMotion: boolean;
}

/** Steps displayed in the indicator (landing excluded) */
const INDICATOR_STEPS: WizardStep[] = STEP_ORDER.filter(
  (step) => step !== "landing"
);

export default function StepIndicator({
  currentStep,
  prefersReducedMotion,
}: StepIndicatorProps) {
  const currentIndex = INDICATOR_STEPS.indexOf(currentStep);
  const stepNumber = currentIndex + 1;
  const totalSteps = INDICATOR_STEPS.length;
  const progressPercent =
    totalSteps > 0 ? (stepNumber / totalSteps) * 100 : 0;
  const stepLabel = `Step ${stepNumber} — ${STEP_LABELS[currentStep]}`;

  return (
    <nav
      aria-label="Interview progress"
      className="mx-auto w-full max-w-[886px] px-4 pt-12 pb-6 md:px-0"
    >
      <div
        className="flex w-full flex-col items-start gap-6"
        role="progressbar"
        aria-valuenow={stepNumber}
        aria-valuemin={1}
        aria-valuemax={totalSteps}
        aria-label={stepLabel}
      >
        <span className="font-inter text-base font-medium leading-[22px] text-text-secondary">
          {stepLabel}
        </span>

        <div className="relative h-1 w-full overflow-hidden">
          {/* Track background */}
          <div className="absolute inset-0 bg-border" />

          {/* Progress fill — uses inline style for accent colour because
             Tailwind v4 reserves "accent" as a utility prefix (accent-color),
             so bg-accent does not generate a background-color rule. */}
          <div
            className={`absolute inset-y-0 left-0${
              prefersReducedMotion
                ? ""
                : " transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
            }`}
            style={{
              width: `${progressPercent}%`,
              backgroundColor: "var(--color-accent)",
            }}
          />
        </div>
      </div>
    </nav>
  );
}
