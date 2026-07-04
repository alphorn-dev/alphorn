import type { ChannelMeta } from "./meta-types";

export const meta: ChannelMeta = {
  type: "smtp",
  displayName: "Email (SMTP)",
  description: "Send notifications via email",
  icon: "email",
  hasTest: true,
  setupGuide: [
    "Configure your SMTP server credentials. Common providers:",
    "- **Gmail**: smtp.gmail.com, port 587. Use an [App Password](https://myaccount.google.com/apppasswords)",
    "- **Outlook**: smtp.office365.com, port 587",
    "- **Custom**: Use your mail server's SMTP settings",
  ].join("\n"),
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
};
