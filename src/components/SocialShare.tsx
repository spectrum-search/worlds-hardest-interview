"use client";

import { useState } from "react";
import { Twitter, Linkedin, Copy, Check } from "lucide-react";

/** Props for the SocialShare component */
export interface SocialShareProps {
  /** ELO rating to include in share text */
  score: number;
  /** "HIRED" or "NOT HIRED" verdict to include in share text */
  verdict: "HIRED" | "NOT HIRED";
  /** The app URL to include in share text */
  appUrl: string;
}

/** Social sharing section for results page — Twitter/X, LinkedIn, and copy-to-clipboard */
export default function SocialShare({ score, verdict, appUrl }: SocialShareProps) {
  const [isCopied, setIsCopied] = useState(false);

  const shareText = `I scored ${score} on The World's Hardest Job Interview. Verdict: ${verdict}. Think you can do better?`;
  const fullShareText = `${shareText} ${appUrl}`;

  function handleTwitterShare() {
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(fullShareText)}`;
    window.open(twitterUrl, "_blank", "noopener,noreferrer");
  }

  function handleLinkedInShare() {
    const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(appUrl)}`;
    window.open(linkedInUrl, "_blank", "noopener,noreferrer");
  }

  async function handleCopyToClipboard() {
    try {
      await navigator.clipboard.writeText(fullShareText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Clipboard API may fail in some contexts — fail silently
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-sm font-medium text-text-secondary">
        Share your result
      </p>

      <div className="flex items-center gap-3">
        {/* Twitter/X */}
        <button
          onClick={handleTwitterShare}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border transition-colors duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-bg-elevated)",
            transitionTimingFunction: "cubic-bezier(0.25, 0.1, 0.25, 1)",
          }}
          aria-label="Share on Twitter"
        >
          <Twitter className="h-4 w-4 text-text-primary" aria-hidden="true" />
        </button>

        {/* LinkedIn */}
        <button
          onClick={handleLinkedInShare}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border transition-colors duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-bg-elevated)",
            transitionTimingFunction: "cubic-bezier(0.25, 0.1, 0.25, 1)",
          }}
          aria-label="Share on LinkedIn"
        >
          <Linkedin className="h-4 w-4 text-text-primary" aria-hidden="true" />
        </button>

        {/* Copy to clipboard */}
        <button
          onClick={handleCopyToClipboard}
          className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 transition-colors duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary focus-visible:ring-offset-2"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-bg-elevated)",
            transitionTimingFunction: "cubic-bezier(0.25, 0.1, 0.25, 1)",
          }}
          aria-label={isCopied ? "Copied to clipboard" : "Copy result to clipboard"}
        >
          {isCopied ? (
            <>
              <Check className="h-4 w-4 text-success" aria-hidden="true" />
              <span className="text-sm font-medium text-success">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 text-text-primary" aria-hidden="true" />
              <span className="text-sm font-medium text-text-primary">Copy</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
