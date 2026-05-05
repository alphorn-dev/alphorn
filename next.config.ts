import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withSentryConfig } from "@sentry/nextjs";

function resolveAppVersion(): string {
  if (process.env.NEXT_PUBLIC_APP_VERSION) return process.env.NEXT_PUBLIC_APP_VERSION;
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  try {
    const gitDir = join(process.cwd(), ".git");
    const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
    const sha = head.startsWith("ref:")
      ? readFileSync(join(gitDir, head.slice(5).trim()), "utf8").trim()
      : head;
    if (sha) return `sha-${sha.slice(0, 7)}`;
  } catch {}
  return "dev";
}

const APP_VERSION = resolveAppVersion();

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pg-boss", "pg", "nodemailer", "@paddle/paddle-node-sdk"],
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ],
    },
  ],
  env: {
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
    NEXT_PUBLIC_SENTRY_DSN: process.env.SENTRY_DSN ?? "",
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT ?? "",
    NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE:
      process.env.SENTRY_TRACES_SAMPLE_RATE ?? "",
  },
};

export default process.env.SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      telemetry: false,
      sourcemaps: { disable: true },
      release: { create: false },
    })
  : nextConfig;
