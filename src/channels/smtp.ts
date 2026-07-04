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
