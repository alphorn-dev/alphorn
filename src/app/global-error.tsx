"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          backgroundColor: "#f5f5f5",
          color: "#171717",
        }}
      >
        <div style={{ maxWidth: "28rem", padding: "1rem", textAlign: "center" }}>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              letterSpacing: "-0.025em",
              margin: 0,
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              marginTop: "0.75rem",
              fontSize: "0.875rem",
              color: "#737373",
            }}
          >
            A critical error occurred. Please try again.
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: "0.5rem",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "0.75rem",
                color: "#737373",
              }}
            >
              Error ID: {error.digest}
            </p>
          )}
          <button
            onClick={() => unstable_retry()}
            style={{
              marginTop: "2rem",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#fff",
              backgroundColor: "#0d9488",
              border: "none",
              borderRadius: "0.375rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
