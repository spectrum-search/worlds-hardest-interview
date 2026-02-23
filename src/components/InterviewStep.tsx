"use client";

import { useConversation } from "@elevenlabs/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { getTransition, getVariants, springs, slideUp } from "@/lib/motion";
import { AGENT_ID } from "@/lib/constants";

interface InterviewStepProps {
  /** Extracted CV text (null if skipped) — passed to ElevenLabs as dynamicVariables.cv_content */
  cvText: string | null;
  /** Called when the interview ends (after 2s delay) with the conversation ID */
  onConversationEnd: (conversationId: string) => void;
  /** Called when the user declines the call — returns to the previous step */
  onDecline: () => void;
  /** Called when an error occurs during the interview */
  onError: (message: string) => void;
  /** Whether the user prefers reduced motion */
  prefersReducedMotion: boolean;
}

/** Hard time limit for the interview session in seconds (15 minutes) */
const INTERVIEW_TIME_LIMIT_SECONDS = 15 * 60;

/** The boss's name shown on the incoming call screen */
const BOSS_NAME = "R.J. Carrington III";

/**
 * Formats elapsed seconds as "MM:SS".
 */
function formatElapsedTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function InterviewStep({
  cvText,
  onConversationEnd,
  onDecline,
  onError,
  prefersReducedMotion,
}: InterviewStepProps) {
  const [ringing, setRinging] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const conversationIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasEndedRef = useRef(false);
  const cvTextRef = useRef(cvText);
  cvTextRef.current = cvText;

  const cvFallback =
    "No CV was uploaded. Ask the candidate about their background from scratch.";

  const conversation = useConversation({
    clientTools: {
      cv_content: async () => cvTextRef.current || cvFallback,
    },
    onConnect: ({ conversationId }) => {
      console.info("[Interview] Connected:", conversationId);
    },
    onDisconnect: () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      const id = conversationIdRef.current;
      if (id) {
        setTimeout(() => onConversationEnd(id), 2000);
      }
    },
    onMessage: ({ source, message }) => {
      console.debug(`[Interview] ${source}:`, message);
    },
    onError: (error) => {
      const message = typeof error === "string" ? error : String(error);
      onError(message || "Voice connection error. Please check your microphone.");
    },
    onModeChange: ({ mode }) => {
      console.debug("[Interview] Mode:", mode);
    },
  });

  // Stable ref so callbacks/effects avoid re-creating when the hook returns a new object each render
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;

  const startConversation = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      onError("Microphone access is required for the interview.");
      return;
    }

    try {
      const conversationId = await conversationRef.current.startSession({
        agentId: AGENT_ID,
        connectionType: "websocket",
        dynamicVariables: {
          cv_content: cvText || cvFallback,
        },
      });
      conversationIdRef.current = conversationId;

      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect to the interview.";
      onError(message);
    }
  }, [cvText, onError]);

  const handleAnswer = useCallback(() => {
    setRinging(false);
    startConversation();
  }, [startConversation]);

  // 15-minute hard time limit
  useEffect(() => {
    if (elapsedSeconds >= INTERVIEW_TIME_LIMIT_SECONDS && !hasEndedRef.current) {
      hasEndedRef.current = true;
      conversationRef.current.endSession();
    }
  }, [elapsedSeconds]);

  // Clean up the timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const endConversation = useCallback(async () => {
    hasEndedRef.current = true;
    await conversationRef.current.endSession();
  }, []);

  const isSpeaking = conversation.isSpeaking;
  const status = conversation.status;

  return (
    <motion.div
      {...getVariants(prefersReducedMotion, {
        initial: { opacity: 0, y: 8, filter: "blur(4px)" },
        animate: { opacity: 1, y: 0, filter: "blur(0)" },
        exit: { opacity: 0, scale: 0.98, filter: "blur(2px)" },
      })}
      transition={getTransition(prefersReducedMotion, springs.snappy)}
    >
      <AnimatePresence mode="wait">
        {/* ─── Incoming call screen ─── */}
        {ringing && (
          <motion.div
            key="ringing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }}
            transition={getTransition(prefersReducedMotion, springs.snappy)}
            className="flex flex-col items-center py-8"
          >
            {/* Pulsing rings + phone icon */}
            <div className="relative flex h-44 w-44 items-center justify-center">
              {/* Concentric pulse rings */}
              <div
                className="absolute h-24 w-24 rounded-full ring-pulse-1"
                style={{ backgroundColor: "var(--color-accent)" }}
                aria-hidden="true"
              />
              <div
                className="absolute h-24 w-24 rounded-full ring-pulse-2"
                style={{ backgroundColor: "var(--color-accent)" }}
                aria-hidden="true"
              />
              <div
                className="absolute h-24 w-24 rounded-full ring-pulse-3"
                style={{ backgroundColor: "var(--color-accent)" }}
                aria-hidden="true"
              />

              {/* Centre phone circle */}
              <motion.div
                animate={{ rotate: [0, -8, 8, -6, 6, -3, 3, 0] }}
                transition={
                  prefersReducedMotion
                    ? { duration: 0.01 }
                    : {
                        duration: 0.6,
                        repeat: Infinity,
                        repeatDelay: 1.4,
                        ease: "easeInOut",
                      }
                }
                className="relative z-10 flex h-24 w-24 items-center justify-center rounded-full"
                style={{
                  backgroundColor: "var(--color-accent)",
                  boxShadow: "var(--shadow-lg)",
                }}
              >
                {/* Phone icon */}
                <svg
                  className="h-10 w-10 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
                  />
                </svg>
              </motion.div>
            </div>

            {/* Caller info */}
            <div className="mt-4 text-center">
              <p
                className="text-xs font-medium uppercase tracking-widest text-text-secondary"
                aria-live="polite"
              >
                Incoming call
              </p>
              <h2
                className="mt-3 font-rubik font-normal text-[30px] leading-[38px] text-text-primary"
                style={{ letterSpacing: "-0.013em" }}
                tabIndex={-1}
              >
                {BOSS_NAME}
              </h2>
              <p className="mt-2 font-inter text-base leading-[22px] text-text-tertiary">
                The interview is about to begin.
              </p>
            </div>

            {/* Answer / Decline buttons */}
            <div className="mt-10 flex items-center gap-4">
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={onDecline}
                className="cursor-pointer rounded-lg border px-6 py-3 text-sm font-medium transition-colors duration-150"
                style={{
                  borderColor: "var(--color-error)",
                  color: "var(--color-error)",
                }}
                aria-label="Decline the call and go back"
              >
                Decline
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={handleAnswer}
                className="cursor-pointer rounded-lg px-6 py-3 text-sm font-medium text-white transition-colors duration-150"
                style={{
                  backgroundColor: "var(--color-success)",
                }}
                aria-label="Answer the call and start the interview"
              >
                Answer
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ─── Active interview screen ─── */}
        {!ringing && (
          <motion.div
            key="interview"
            initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0)" }}
            transition={getTransition(prefersReducedMotion, springs.snappy)}
          >
            {/* Header with title and elapsed time */}
            <div className="flex items-start justify-between">
              <div>
                <h2
                  className="font-rubik font-normal text-[30px] leading-[38px] text-text-primary"
                  style={{ letterSpacing: "-0.013em" }}
                  tabIndex={-1}
                >
                  Interview with {BOSS_NAME}
                </h2>
                <p className="mt-3 font-inter text-base leading-[22px] text-text-tertiary max-w-[634px]">
                  {BOSS_NAME} will question your experience, skills and composure.
                  Speak naturally — end the interview whenever you are ready.
                </p>
              </div>

              {/* Elapsed time indicator */}
              {status === "connected" && (
                <div
                  className="shrink-0 ml-4 mt-1 font-inter text-xs tabular-nums"
                  style={{
                    color:
                      elapsedSeconds >= INTERVIEW_TIME_LIMIT_SECONDS - 60
                        ? "var(--color-error)"
                        : "var(--color-text-tertiary)",
                  }}
                  aria-label={`Elapsed time: ${formatElapsedTime(elapsedSeconds)}`}
                  aria-live="off"
                >
                  {formatElapsedTime(elapsedSeconds)}
                </div>
              )}
            </div>

            {/* Mic visualiser */}
            <div className="my-12 flex flex-col items-center gap-6">
              {/* Status label with crossfade */}
              <div className="relative h-6 overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={status + String(isSpeaking)}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={getTransition(prefersReducedMotion, {
                      duration: 0.15,
                    })}
                    className="text-xs font-medium uppercase tracking-widest text-text-secondary"
                    aria-live="polite"
                  >
                    {status === "connecting"
                      ? "Connecting…"
                      : status === "connected"
                        ? isSpeaking
                          ? `${BOSS_NAME} is speaking`
                          : "Listening to you"
                        : "Waiting…"}
                  </motion.p>
                </AnimatePresence>
              </div>

              {/* Microphone indicator */}
              <div className="relative flex h-40 w-40 items-center justify-center sm:h-44 sm:w-44">
                {/* Pulse ring */}
                {status === "connected" && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={getTransition(prefersReducedMotion, springs.gentle)}
                    className="absolute h-32 w-32 rounded-full sm:h-36 sm:w-36 mic-pulse"
                    style={{
                      backgroundColor: isSpeaking
                        ? "rgba(105, 154, 214, 0.15)"
                        : "rgba(24, 24, 24, 0.06)",
                    }}
                    aria-hidden="true"
                  />
                )}

                {/* Centre mic circle */}
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{
                    scale:
                      status === "connected"
                        ? isSpeaking
                          ? 1.05
                          : 1
                        : 0.9,
                    opacity: 1,
                  }}
                  transition={getTransition(prefersReducedMotion, {
                    ...springs.gentle,
                    duration: 0.3,
                  })}
                  className="relative flex h-20 w-20 items-center justify-center rounded-full sm:h-24 sm:w-24"
                  style={{
                    backgroundColor:
                      status === "connected"
                        ? isSpeaking
                          ? "var(--color-accent)"
                          : "var(--color-text-primary)"
                        : "var(--color-bg-muted)",
                    boxShadow:
                      status === "connected"
                        ? "var(--shadow-lg)"
                        : "var(--shadow-sm)",
                    transitionProperty: "background-color",
                    transitionDuration: "300ms",
                    transitionTimingFunction: "cubic-bezier(0.25, 0.1, 0.25, 1)",
                  }}
                >
                  {/* Microphone icon */}
                  <svg
                    className="h-10 w-10"
                    style={{
                      color:
                        status === "connected"
                          ? "white"
                          : "var(--color-text-secondary)",
                    }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                    />
                  </svg>
                </motion.div>
              </div>

              {/* End Interview button (appears when connected) */}
              <AnimatePresence>
                {status === "connected" && (
                  <motion.button
                    {...slideUp}
                    transition={getTransition(prefersReducedMotion, {
                      ...springs.gentle,
                      delay: 0.5,
                    })}
                    onClick={endConversation}
                    className="cursor-pointer rounded-lg border px-5 py-2.5 text-sm font-medium transition-colors duration-150"
                    style={{
                      borderColor: "var(--color-text-tertiary)",
                      color: "var(--color-text-secondary)",
                    }}
                    whileHover={{
                      scale: 1.02,
                      backgroundColor: "#f5f5f5",
                      borderColor: "#666666",
                      color: "#333333",
                    }}
                    whileTap={{ scale: 0.97 }}
                  >
                    End Interview
                  </motion.button>
                )}
              </AnimatePresence>

              {/* Connecting hint */}
              {status === "connecting" && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={getTransition(prefersReducedMotion, { delay: 0.3 })}
                  className="text-sm text-text-secondary"
                >
                  Requesting microphone access…
                </motion.p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
