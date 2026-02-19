"use client";

import { useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useInterviewWizard } from "@/hooks/useInterviewWizard";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { fetchTranscript } from "@/lib/elevenlabs";
import { getTransition, springs } from "@/lib/motion";

import LandingStep from "@/components/LandingStep";
import UploadCvStep from "@/components/UploadCvStep";
import InterviewStep from "@/components/InterviewStep";
import AnalysisStep from "@/components/AnalysisStep";
import ResultsStep from "@/components/ResultsStep";
import StepIndicator from "@/components/StepIndicator";

import type { WizardState } from "@/lib/types";

export default function Home() {
  const { state, actions } = useInterviewWizard();
  const prefersReducedMotion = useReducedMotion();

  /* Ref for reading fresh state during async operations (analysis pipeline).
     Prevents stale closure values when the pipeline spans multiple async steps. */
  const stateSnapshotRef = useRef<WizardState>(state);
  stateSnapshotRef.current = state;

  /* Ref for focus management on step transitions */
  const mainContentRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  /* Move focus to the step content area when the wizard step changes.
     Skips the initial mount to avoid stealing focus from the natural tab order.
     Skips the "landing" step as it has its own focus strategy.
     Uses requestAnimationFrame to allow the new step to render before focusing. */
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (state.step === "landing") return;
    const raf = requestAnimationFrame(() => {
      if (!mainContentRef.current) return;
      const heading =
        mainContentRef.current.querySelector<HTMLElement>("h2") ??
        mainContentRef.current.querySelector<HTMLElement>(
          "button, input, [tabindex]"
        );
      if (heading) {
        heading.focus({ preventScroll: true });
      } else {
        mainContentRef.current.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [state.step]);

  /* Analysis pipeline: fetchTranscript -> POST /api/score-interview -> set results.
     Reads from stateSnapshotRef to get the latest state values mid-chain. */
  async function runAnalysisPipeline(conversationId: string) {
    actions.setStep("analysis");
    actions.setAnalysisPhase(1);

    try {
      // Phase 1: Retrieve transcript
      const transcript = await fetchTranscript(conversationId);
      actions.setTranscript(transcript);

      // Phase 2: Score the interview
      actions.setAnalysisPhase(2);

      const snap = stateSnapshotRef.current;
      const transcriptText = transcript
        .map(
          (e) => `${e.role === "agent" ? "Interviewer" : "Candidate"}: ${e.message}`
        )
        .join("\n\n");

      const scoreRes = await fetch("/api/score-interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cvText: snap.cvText || "",
          transcript: transcriptText,
        }),
      });

      if (!scoreRes.ok) {
        const body = await scoreRes.json().catch(() => ({}));
        throw new Error(
          body.error || `Scoring failed (${scoreRes.status})`
        );
      }

      const scoringResults = await scoreRes.json();
      actions.setResults(scoringResults);

      // Phase 3: Brief visual "deliberating" phase
      actions.setAnalysisPhase(3);
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Advance to results
      actions.setStep("results");
    } catch (err) {
      actions.setError(
        err instanceof Error
          ? err.message
          : "Something went wrong during analysis. Please try again."
      );
      actions.setAnalysisPhase(null);
    }
  }

  /* Handle conversation end from the InterviewStep — stores the conversation ID
     and kicks off the analysis pipeline. */
  const handleConversationEnd = useCallback(
    (conversationId: string) => {
      actions.setConversationId(conversationId);
      runAnalysisPipeline(conversationId);
    },
    [actions]
  );

  /* Handler for "Try Again" — preserves CV, returns to interview step */
  const handleTryAgain = useCallback(() => {
    actions.resetForRetry();
  }, [actions]);

  /* Handler for "Start Over" — full reset to landing step */
  const handleStartOver = useCallback(() => {
    actions.resetFull();
  }, [actions]);

  /* Handler for upload success — stores CV text and advances to interview */
  const handleFileUploaded = useCallback(
    (text: string, fileName: string) => {
      actions.setCvText(text);
      actions.setCvFileName(fileName);
      actions.setStep("interview");
    },
    [actions]
  );

  /* Handler for upload skip — advances to interview without a CV */
  const handleSkipUpload = useCallback(() => {
    actions.setStep("interview");
  }, [actions]);

  /* Handler for declining the incoming call — returns to upload-cv step */
  const handleDecline = useCallback(() => {
    actions.setStep("upload-cv");
  }, [actions]);

  /* Handler for errors from step components */
  const handleError = useCallback(
    (message: string) => {
      actions.setError(message);
    },
    [actions]
  );

  /* Handler for beginning the interview from the landing page */
  const handleBegin = useCallback(() => {
    actions.setStep("upload-cv");
  }, [actions]);

  const isLanding = state.step === "landing";

  return (
    <div className="flex min-h-screen flex-col">
      {/* Skip-to-content link — first focusable element for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-text-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg"
      >
        Skip to content
      </a>

      {/* Step indicator — hidden on landing */}
      {!isLanding && (
        <StepIndicator
          currentStep={state.step}
          prefersReducedMotion={prefersReducedMotion}
        />
      )}

      {/* Error banner with shake animation */}
      <AnimatePresence mode="wait">
        {state.error && (
          <motion.div
            key={state.error}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={
              prefersReducedMotion
                ? { duration: 0.01 }
                : { duration: 0.3, ease: [0.4, 0, 0.2, 1] }
            }
            className="error-shake mx-auto w-full max-w-[886px] px-6"
          >
            <div
              className="mt-4 rounded-lg border border-error/20 bg-error/10 px-4 py-3 text-sm text-error"
              role="alert"
              aria-live="assertive"
            >
              <div className="flex items-start gap-2">
                <svg
                  className="h-5 w-5 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div className="flex-1">
                  {state.error}
                  <button
                    onClick={() => actions.setError(null)}
                    className="ml-2 cursor-pointer font-medium underline transition-colors duration-150 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Landing step renders OUTSIDE the card container.
         No AnimatePresence exit — the landing wrapper uses flex-1, so an exit
         animation would keep it in the DOM taking up full height while the card
         container renders below it, causing a visible gap that collapses. The
         upload-cv step already has its own entrance animation for visual polish. */}
      {isLanding && (
        <div id="main-content" className="flex flex-1">
          <LandingStep
            onBegin={handleBegin}
            prefersReducedMotion={prefersReducedMotion}
          />
        </div>
      )}

      {/* Card container for steps 2–5 */}
      {!isLanding && (
        <div className="mx-auto w-full max-w-[886px] px-4 py-6 md:px-0">
          <div
            id="main-content"
            ref={mainContentRef}
            tabIndex={-1}
            className="border border-border rounded-3xl bg-bg-elevated p-6 outline-none md:p-9"
          >
            <AnimatePresence mode="wait">
              {state.step === "upload-cv" && (
                <motion.div
                  key="upload-cv"
                  initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0)" }}
                  exit={{ opacity: 0, scale: 0.98, filter: "blur(2px)" }}
                  transition={getTransition(prefersReducedMotion, springs.snappy)}
                >
                  <UploadCvStep
                    onFileUploaded={handleFileUploaded}
                    onSkip={handleSkipUpload}
                    onError={handleError}
                    prefersReducedMotion={prefersReducedMotion}
                  />
                </motion.div>
              )}

              {state.step === "interview" && (
                <motion.div
                  key="interview"
                  initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0)" }}
                  exit={{ opacity: 0, scale: 0.98, filter: "blur(2px)" }}
                  transition={getTransition(prefersReducedMotion, springs.snappy)}
                >
                  <InterviewStep
                    cvText={state.cvText}
                    onConversationEnd={handleConversationEnd}
                    onDecline={handleDecline}
                    onError={handleError}
                    prefersReducedMotion={prefersReducedMotion}
                  />
                </motion.div>
              )}

              {state.step === "analysis" && state.analysisPhase && (
                <motion.div
                  key="analysis"
                  initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0)" }}
                  exit={{ opacity: 0, scale: 0.98, filter: "blur(2px)" }}
                  transition={getTransition(prefersReducedMotion, springs.snappy)}
                >
                  <AnalysisStep
                    phase={state.analysisPhase!}
                    prefersReducedMotion={prefersReducedMotion}
                  />
                </motion.div>
              )}

              {state.step === "results" &&
                state.results &&
                state.transcript && (
                  <motion.div
                    key="results"
                    initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0)" }}
                    exit={{ opacity: 0, scale: 0.98, filter: "blur(2px)" }}
                    transition={getTransition(prefersReducedMotion, springs.snappy)}
                  >
                    <ResultsStep
                      results={state.results}
                      transcript={state.transcript}
                      onTryAgain={handleTryAgain}
                      onStartOver={handleStartOver}
                      prefersReducedMotion={prefersReducedMotion}
                    />
                  </motion.div>
                )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
