"use client";

import { useRef, useState } from "react";

import type {
  AnalysisPhase,
  ScoringResults,
  TranscriptEntry,
  WizardActions,
  WizardState,
  WizardStep,
} from "@/lib/types";

const INITIAL_STATE: WizardState = {
  step: "landing",
  cvText: null,
  cvFileName: null,
  conversationId: null,
  transcript: null,
  results: null,
  analysisPhase: null,
  error: null,
  loading: false,
};

/**
 * Central wizard state management hook for the 5-step interview flow.
 *
 * Follows the interview-elo useRef stable-actions pattern exactly:
 * - `actionsRef.current` is initialised once (null check), never rebuilt
 * - Each action calls `setState` (stable from React) with a functional updater
 * - `stateRef.current` is synced on every render so actions can read fresh state
 */
export function useInterviewWizard(): {
  state: WizardState;
  actions: WizardActions;
} {
  const [state, setState] = useState<WizardState>(INITIAL_STATE);

  // Keep a ref to the latest state so action functions can read current values
  // without being recreated. Needed by resetForRetry to preserve specific fields.
  const stateRef = useRef<WizardState>(state);
  stateRef.current = state;

  // Build the actions object once and return the same reference every render.
  // Each function calls setState (stable from React) and reads stateRef.current
  // for the latest state values.
  const actionsRef = useRef<WizardActions | null>(null);
  if (actionsRef.current === null) {
    actionsRef.current = {
      setStep: (step: WizardStep) => {
        setState((s) => ({ ...s, step, error: null }));
      },

      setCvText: (text: string | null) => {
        setState((s) => ({ ...s, cvText: text }));
      },

      setCvFileName: (name: string | null) => {
        setState((s) => ({ ...s, cvFileName: name }));
      },

      setConversationId: (id: string | null) => {
        setState((s) => ({ ...s, conversationId: id }));
      },

      setTranscript: (entries: TranscriptEntry[] | null) => {
        setState((s) => ({ ...s, transcript: entries }));
      },

      setResults: (results: ScoringResults | null) => {
        setState((s) => ({ ...s, results }));
      },

      setAnalysisPhase: (phase: AnalysisPhase | null) => {
        setState((s) => ({ ...s, analysisPhase: phase }));
      },

      setError: (message: string | null) => {
        setState((s) => ({ ...s, error: message }));
      },

      setLoading: (loading: boolean) => {
        setState((s) => ({ ...s, loading }));
      },

      resetForRetry: () => {
        const current = stateRef.current;
        setState({
          ...INITIAL_STATE,
          step: "interview",
          cvText: current.cvText,
          cvFileName: current.cvFileName,
        });
      },

      resetFull: () => {
        setState(INITIAL_STATE);
      },
    };
  }

  return { state, actions: actionsRef.current };
}
