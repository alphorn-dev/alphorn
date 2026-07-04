import type { ConfigField } from "./types";

/** Shared config field for channels that take a single webhook URL. Client-safe (no zod). */
export function webhookUrlConfigField(opts: { helpText: string; placeholder: string }): ConfigField {
  return {
    key: "webhookUrl",
    label: "Webhook URL",
    type: "text",
    required: true,
    helpText: opts.helpText,
    placeholder: opts.placeholder,
  };
}
