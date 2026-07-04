import type { ConfigField } from "./types";

/**
 * Client-safe channel metadata. No Node.js dependencies — this is the type
 * shared between each channel's `<type>.meta.ts` (imported by both the UI
 * and the server handler) and the aggregating barrel in `meta.ts`.
 */
export interface ChannelMeta {
  type: string;
  displayName: string;
  description: string;
  icon: string;
  setupGuide?: string;
  configFields: ConfigField[];
  hasTest: boolean;
}
