// "auto": known-source formatters (./auto.ts), the primary path; add new
// sources there. "template": user-authored templates. "none": generic heuristic.
export const EXTRACT_MODES = ["auto", "none", "template"] as const;
export type ExtractMode = (typeof EXTRACT_MODES)[number];
