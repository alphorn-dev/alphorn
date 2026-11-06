import { z } from "zod";
import nodemailer from "nodemailer";
import { registerChannel } from "./registry";
import { PermanentChannelError } from "./errors";
import { subjectFallback } from "./subject";
import { escapeHtml } from "./utils";
import { meta } from "./smtp.meta";

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
  ...meta,
  configSchema,
  async send(config, notification) {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: isSecure(config.secure, config.port),
      // Without this, a network attacker can strip STARTTLS and read credentials in plaintext.
      // Plain auto mode on other ports (e.g. 25 to a local relay) stays opportunistic.
      requireTLS: config.secure === "starttls" || (config.secure === "auto" && config.port === 587),
      // Fail fast on unreachable/slow servers - nodemailer's defaults (up to
      // 10 min) would exceed the 5 min delivery job timeout.
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
      // nodemailer opens raw sockets, which the global undici dispatcher
      // (src/lib/http/egress.ts) doesn't see. Tunnel them through the same
      // egress proxy via HTTP CONNECT, so a user-supplied host can't reach
      // internal addresses.
      ...(process.env.EGRESS_PROXY_URL && { proxy: process.env.EGRESS_PROXY_URL }),
      auth: {
        user: config.username,
        pass: config.password,
      },
    });

    const subject = subjectFallback(notification.title, notification.message);
    try {
      await transporter.sendMail({
        from: config.from,
        to: config.to,
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
});
