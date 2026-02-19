"use client";

import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { getTransition, getVariants, springs, scaleIn, slideUp } from "@/lib/motion";

interface UploadCvStepProps {
  /** Called with extracted CV text after successful upload */
  onFileUploaded: (text: string, fileName: string) => void;
  /** Called when the user clicks "Skip" to proceed without a CV */
  onSkip: () => void;
  /** Called when an error occurs during upload */
  onError: (message: string) => void;
  /** Whether the user prefers reduced motion */
  prefersReducedMotion: boolean;
}

export default function UploadCvStep({
  onFileUploaded,
  onSkip,
  onError,
  prefersReducedMotion,
}: UploadCvStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const processFile = useCallback(
    async (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!ext || !["pdf", "docx", "txt"].includes(ext)) {
        const message = "Unsupported file type. Please upload a PDF, DOCX, or TXT file.";
        setLocalError(message);
        onError(message);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        const message = "File is too large. Maximum size is 10 MB.";
        setLocalError(message);
        onError(message);
        return;
      }

      setLocalError(null);
      setIsUploading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Upload failed (${res.status})`);
        }

        const { text } = await res.json();
        setUploadedFileName(file.name);
        onFileUploaded(text, file.name);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Something went wrong during upload. Please try again.";
        setLocalError(message);
        onError(message);
      } finally {
        setIsUploading(false);
      }
    },
    [onFileUploaded, onError],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleZoneClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      /* Avoid double-triggering when a nested button already handles the click */
      const target = e.target as HTMLElement;
      if (target.closest("button")) return;
      fileInputRef.current?.click();
    },
    [],
  );

  const handleZoneKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        fileInputRef.current?.click();
      }
    },
    [],
  );

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
        className="font-rubik font-normal text-[30px] leading-[38px] text-text-primary"
        style={{ letterSpacing: "-0.013em" }}
        tabIndex={-1}
      >
        Show me what you've got
      </h2>
      <p className="mt-3 font-inter text-base leading-[22px] text-text-tertiary max-w-[634px]">
        Upload your CV so R.J. Carrington III can tailor his questions to your
        experience. Consider it reconnaissance — he will find your weaknesses
        either way.
      </p>

      {/* Error display */}
      <AnimatePresence mode="wait">
        {localError && (
          <motion.p
            key="error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={getTransition(prefersReducedMotion, { duration: 0.15 })}
            className="mt-4 text-sm font-medium text-error"
            role="alert"
          >
            {localError}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Upload zone */}
      <motion.div
        role="button"
        tabIndex={0}
        onClick={handleZoneClick}
        onKeyDown={handleZoneKeyDown}
        className="mt-8 flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-16 transition-all"
        style={{
          borderColor: dragOver
            ? "var(--color-accent)"
            : "var(--color-border)",
          backgroundColor: dragOver
            ? "rgba(105, 154, 214, 0.06)"
            : "var(--color-bg-muted)",
          boxShadow: dragOver ? "var(--shadow-xl)" : "var(--shadow-sm)",
          transitionDuration: "200ms",
          transitionTimingFunction: "cubic-bezier(0.25, 0.1, 0.25, 1)",
        }}
        animate={{
          scale: dragOver ? 1.02 : 1,
        }}
        transition={getTransition(prefersReducedMotion, { duration: 0.2 })}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        aria-label="Upload CV file. Drag and drop a file here, or press Enter to browse."
        aria-busy={isUploading}
      >
        <AnimatePresence mode="wait">
          {isUploading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col items-center gap-3"
            >
              <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-text-primary border-t-transparent"
                role="status"
                aria-label="Processing upload"
              />
              <p className="text-sm text-text-secondary">
                Extracting text...
              </p>
            </motion.div>
          ) : uploadedFileName ? (
            <motion.div
              key="success"
              {...scaleIn}
              transition={getTransition(prefersReducedMotion, springs.bouncy)}
              className="flex flex-col items-center gap-3"
            >
              {/* Checkmark icon */}
              <motion.svg
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                transition={getTransition(prefersReducedMotion, springs.bouncy)}
                className="h-12 w-12 text-success"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </motion.svg>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={getTransition(prefersReducedMotion, {
                  ...springs.snappy,
                  delay: 0.1,
                })}
                className="text-sm font-medium text-text-primary"
              >
                {uploadedFileName}
              </motion.p>
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={getTransition(prefersReducedMotion, {
                  ...springs.snappy,
                  delay: 0.2,
                })}
                onClick={() => fileInputRef.current?.click()}
                className="font-inter font-medium text-sm leading-5 text-text-secondary underline cursor-pointer transition-colors duration-150 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2"
              >
                Replace file
              </motion.button>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col items-center"
            >
              {/* Upload cloud icon */}
              <svg
                className="mb-3 h-12 w-12 text-text-secondary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 3.75 3.75 0 013.572 5.17A4.5 4.5 0 0117.25 19.5H6.75z"
                />
              </svg>
              <p className="text-sm text-text-primary">
                Drag your file or{" "}
                <span className="font-bold text-text-primary underline">
                  browse
                </span>
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                PDF, DOCX or TXT · Max 10 MB
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          onChange={handleFileChange}
          className="hidden"
          aria-label="Upload CV file"
        />
      </motion.div>

      <p className="mt-3 text-xs text-text-secondary">
        Supports .pdf, .docx and .txt files
      </p>

      {/* OR divider */}
      <div className="my-8 flex items-center gap-4">
        <div
          className="h-px flex-1"
          style={{ backgroundColor: "var(--color-border)" }}
        />
        <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">
          or
        </span>
        <div
          className="h-px flex-1"
          style={{ backgroundColor: "var(--color-border)" }}
        />
      </div>

      {/* Skip link (underline text) with boss-themed copy */}
      <button
        onClick={onSkip}
        className="font-inter font-medium text-base leading-[22px] text-text-primary underline cursor-pointer transition-colors duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2"
      >
        Or skip — if you dare.
      </button>

      {/* Continue footer (appears after successful upload) */}
      <AnimatePresence>
        {uploadedFileName && (
          <motion.div
            {...slideUp}
            transition={getTransition(prefersReducedMotion, springs.gentle)}
            className="mt-8 flex items-center justify-end pt-6"
          >
            <button
              onClick={onSkip}
              className="inline-flex items-center justify-center rounded-lg py-2 px-4 bg-text-primary font-inter font-medium text-sm leading-5 text-white cursor-pointer transition-colors duration-150 hover:bg-[#333333] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2"
            >
              Continue
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
