"use client";

import { compareHosts } from "@/lib/webhook-loop/same-host";

export function webhookConflict(url: string, appUrl: string): boolean {
  return Boolean(url) && compareHosts(url, appUrl);
}

export function WebhookHostHint({ url, appUrl }: { url: string; appUrl: string }) {
  const host = new URL(appUrl).host;
  const conflict = webhookConflict(url, appUrl);
  return (
    <div
      className={`rounded-md border p-3 text-xs ${
        conflict
          ? "border-destructive bg-destructive/10 text-destructive"
          : "border-muted bg-muted/40 text-muted-foreground"
      }`}
    >
      {conflict
        ? `This URL points at ${host} — the current Alphorn instance. Webhook channels cannot target this server.`
        : `Note: the URL cannot point at ${host} (this Alphorn instance). Attach channels directly to your webhook to deliver here.`}
    </div>
  );
}
