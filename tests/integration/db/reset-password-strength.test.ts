import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture outgoing mail at our mailer boundary so the reset token comes from
// Better Auth's real flow. Must be hoisted: auth reads isMailerConfigured() at import.
const mail = vi.hoisted(() => ({ sent: [] as { to: string; html: string }[] }));
vi.mock("@/lib/email/mailer", () => ({
  isMailerConfigured: () => true,
  sendMail: async (to: string, _subject: string, html: string) => {
    mail.sent.push({ to, html });
  },
}));

import { auth } from "@/lib/auth";

const email = "rosalind@example.com";

async function requestResetToken(): Promise<string> {
  mail.sent = [];
  await auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" } });
  const html = mail.sent.find((m) => m.to === email)?.html ?? "";
  const token = html.match(/reset-password\/([^?"&/]+)/)?.[1];
  if (!token) throw new Error("no reset link in captured mail");
  return token;
}

function resetPassword(token: string, newPassword: string) {
  return auth.api.resetPassword({ body: { token, newPassword }, asResponse: true });
}

describe("password strength on /reset-password", () => {
  beforeEach(async () => {
    await auth.api.signUpEmail({ body: { email, password: "Initial-pass-42!", name: "R" } });
  });

  // Guards the before-hook in src/lib/auth/index.ts, which rebuilds Better Auth's
  // internal `reset-password:<token>` key. If that key format changes, the hook
  // silently skips the check and this test fails.
  it("rejects a new password containing the email local part, without consuming the link", async () => {
    const token = await requestResetToken();

    // The before-hook's APIError propagates even with asResponse.
    await expect(resetPassword(token, "rosalind-2026!")).rejects.toThrow(
      "must not contain your email",
    );

    expect((await resetPassword(token, "Correct-horse-battery-9")).status).toBe(200);
  });
});
