"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ERROR_ID = "password-error";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError("Wrong password");
        setShakeKey((k) => k + 1);
      }
    } catch {
      setError("Something went wrong");
      setShakeKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-primary px-4">
      <form
        key={`shake-${shakeKey}`}
        onSubmit={handleSubmit}
        className={`w-full max-w-sm rounded-xl bg-bg-elevated p-8 ${shakeKey > 0 ? "error-shake" : ""}`}
        style={{ boxShadow: "var(--shadow-lg)" }}
      >
        <h1 className="text-2xl font-bold text-text-primary">
          Password required
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Enter the password to access this site.
        </p>

        <div className="mt-6">
          <label
            htmlFor="password-input"
            className="block text-sm font-semibold text-text-primary"
          >
            Password
          </label>
          <input
            id="password-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            autoFocus
            aria-describedby={error ? ERROR_ID : undefined}
            aria-invalid={error ? "true" : undefined}
            className="mt-2 w-full rounded-lg border border-border bg-white px-4 py-3 text-sm text-text-primary outline-none placeholder:text-text-secondary/50 transition-[border-color,box-shadow] duration-[150ms] ease-[cubic-bezier(0.4,0,0.2,1)] focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_rgba(105,154,214,0.15)]"
          />
        </div>

        {error && (
          <p
            id={ERROR_ID}
            role="alert"
            className="mt-2 text-sm font-medium text-error"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !password}
          className="mt-4 w-full rounded-lg bg-bg-dark px-4 py-3 text-sm font-bold text-white disabled:opacity-40 disabled:pointer-events-none"
        >
          {loading ? "Checking..." : "Enter"}
        </button>
      </form>
    </div>
  );
}
