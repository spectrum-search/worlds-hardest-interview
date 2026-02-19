import type { TranscriptEntry } from "./types";

const BASE_DELAY_MS = 3000;
const BACKOFF_MULTIPLIER = 1.5;
const MAX_ATTEMPTS = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchTranscript(
  conversationId: string
): Promise<TranscriptEntry[]> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res: Response;

    try {
      res = await fetch(`/api/conversations/${conversationId}`);
    } catch {
      throw new Error(
        "Network error — please check your connection and try again."
      );
    }

    // Transcript is ready
    if (res.status === 200) {
      try {
        const data = await res.json();
        return data.transcript as TranscriptEntry[];
      } catch {
        throw new Error(
          "Failed to fetch transcript — unexpected server response."
        );
      }
    }

    // Transcript not yet available — retry with backoff
    if (res.status === 202) {
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(BASE_DELAY_MS * BACKOFF_MULTIPLIER ** attempt);
      }
      continue;
    }

    // Error response (4xx/5xx) — do not retry
    let errorMessage = `Failed to fetch transcript (${res.status})`;
    try {
      const body = await res.json();
      if (body.error) {
        errorMessage = body.error;
      }
    } catch {
      // JSON parse failed — use the fallback message
    }
    throw new Error(errorMessage);
  }

  throw new Error(
    "Transcript is not yet available. Please wait a moment and try again."
  );
}
