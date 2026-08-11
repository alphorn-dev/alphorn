/**
 * Truncates text to at most `max` chars, replacing the cut tail with an
 * ellipsis so the result stays within the limit. Use per-channel API limits
 * (Slack block text, Discord embeds, SMS bodies, …) as `max`.
 */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 1)) + "…";
}
