import { describe, expect, it } from "vitest";
import {
  verificationEmailTemplate,
  invitationEmailTemplate,
  passwordResetEmailTemplate,
} from "@/lib/email/templates";

describe("email templates", () => {
  it("renders the shared layout and escaped verification URL", () => {
    const html = verificationEmailTemplate('https://notifex.test/verify?token="abc"&x=<tag>');

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Alphorn");
    expect(html).toContain("Verify your email address");
    expect(html).toContain(
      'href="https://notifex.test/verify?token=&quot;abc&quot;&amp;x=&lt;tag&gt;"'
    );
  });

  it("escapes inviter and organization names in invitation emails", () => {
    const html = invitationEmailTemplate(
      'Ops <Team>',
      'Alice & "Bob"',
      "https://notifex.test/invite"
    );

    expect(html).toContain("You&apos;ve been invited".replace("&apos;", "'"));
    expect(html).toContain("Ops &lt;Team&gt;");
    expect(html).toContain("Alice &amp; &quot;Bob&quot;");
    expect(html).toContain("Accept Invitation");
  });

  it("renders the password-reset template copy", () => {
    const html = passwordResetEmailTemplate("https://notifex.test/reset");

    expect(html).toContain("Reset your password");
    expect(html).toContain("Reset Password");
    expect(html).toContain("The link expires in 1 hour.");
  });
});
