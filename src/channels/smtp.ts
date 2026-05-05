import { z } from "zod";
import nodemailer from "nodemailer";
import { registerChannel } from "./registry";
import { PermanentChannelError } from "./errors";
import { subjectFallback } from "./subject";

// EAUTH: credentials rejected. EENVELOPE: invalid from/to address.
// 5xx SMTP response: hard failure per RFC 5321.
function classifyMailError(err: unknown): never {
  const code = (err as { code?: unknown })?.code;
  const responseCode = (err as { responseCode?: unknown })?.responseCode;
  const message = err instanceof Error ? err.message : String(err);
  if (
    code === "EAUTH" ||
    code === "EENVELOPE" ||
    (typeof responseCode === "number" && responseCode >= 500 && responseCode < 600)
  ) {
    throw new PermanentChannelError(message);
  }
  throw err;
}

const configSchema = z.object({
  host: z.string().min(1, "SMTP host is required"),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  secure: z.preprocess(
    (val) => {
      if (val === true || val === "true") return "ssl";
      if (val === false || val === "false") return "starttls";
      if (val === undefined || val === null || val === "") return "auto";
      return val;
    },
    z.enum(["auto", "starttls", "ssl"]).default("auto")
  ),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  from: z.string().email("Must be a valid email"),
  to: z.string().min(1, "Recipient is required"),
});

function isSecure(mode: "auto" | "starttls" | "ssl", port: number): boolean {
  if (mode === "ssl") return true;
  if (mode === "starttls") return false;
  return port === 465;
}

registerChannel({
  type: "smtp",
  displayName: "Email (SMTP)",
  description: "Send notifications via email",
  icon: "email",
  setupGuide: [
    "Configure your SMTP server credentials. Common providers:",
    "- **Gmail**: smtp.gmail.com, port 587. Use an [App Password](https://myaccount.google.com/apppasswords)",
    "- **Outlook**: smtp.office365.com, port 587",
    "- **Custom**: Use your mail server's SMTP settings",
  ].join("\n"),
  configSchema,
  configFields: [
    {
      key: "host",
      label: "SMTP Host",
      type: "text",
      required: true,
      placeholder: "smtp.gmail.com",
    },
    {
      key: "port",
      label: "Port",
      type: "number",
      required: true,
      helpText: "587 for STARTTLS (recommended), 465 for implicit SSL/TLS",
      placeholder: "587",
    },
    {
      key: "secure",
      label: "Encryption",
      type: "select",
      helpText: "Leave on Auto unless your server uses a non-standard port",
      options: [
        { label: "Auto (based on port)", value: "auto" },
        { label: "STARTTLS", value: "starttls" },
        { label: "SSL / Implicit TLS", value: "ssl" },
      ],
    },
    {
      key: "username",
      label: "Username",
      type: "text",
      required: true,
      placeholder: "you@gmail.com",
    },
    {
      key: "password",
      label: "Password",
      type: "password",
      required: true,
      helpText: "For Gmail, use an App Password instead of your account password",
    },
    {
      key: "from",
      label: "From Address",
      type: "text",
      required: true,
      placeholder: "notifications@example.com",
    },
    {
      key: "to",
      label: "To Address",
      type: "text",
      required: true,
      helpText: "Recipient email address. Separate multiple addresses with commas",
      placeholder: "you@example.com",
    },
  ],
  async send(config, notification) {
    const parsed = configSchema.parse(config);
    const transporter = nodemailer.createTransport({
      host: parsed.host,
      port: parsed.port,
      secure: isSecure(parsed.secure, parsed.port),
      auth: {
        user: parsed.username,
        pass: parsed.password,
      },
    });

    const subject = subjectFallback(notification.title, notification.message);
    try {
      await transporter.sendMail({
        from: parsed.from,
        to: parsed.to,
        subject,
        text: notification.message,
        html: notification.title
          ? `<h2>${escapeHtml(notification.title)}</h2><p>${escapeHtml(notification.message)}</p>`
          : `<p>${escapeHtml(notification.message)}</p>`,
      });
    } catch (err) {
      classifyMailError(err);
    }
  },
  async test(config) {
    const parsed = configSchema.parse(config);
    const transporter = nodemailer.createTransport({
      host: parsed.host,
      port: parsed.port,
      secure: isSecure(parsed.secure, parsed.port),
      auth: {
        user: parsed.username,
        pass: parsed.password,
      },
    });
    try {
      await transporter.sendMail({
        from: parsed.from,
        to: parsed.to,
        subject: "Alphorn Test",
        text: "This is a test message from Alphorn. If you receive this, your email channel is configured correctly.",
        html: "<h2>Alphorn Test</h2><p>This is a test message from Alphorn. If you receive this, your email channel is configured correctly.</p>",
      });
    } catch (err) {
      classifyMailError(err);
    }
  },
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
