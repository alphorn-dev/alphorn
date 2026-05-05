"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getChannelMeta } from "@/channels/meta";
import { updateChannel, deleteChannel, testChannel, getSseConnectionCount } from "../../actions";
import { ChannelConfigForm, SetupGuidePanel } from "@/components/channel-config-form";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Copy } from "lucide-react";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import { compareHosts } from "@/lib/webhook-loop/same-host";

interface ChannelData {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  enabled: boolean;
  publicId: string;
}

function WebhookHostHint({ url, appUrl }: { url: string; appUrl: string }) {
  const host = new URL(appUrl).host;
  const conflict = Boolean(url) && compareHosts(url, appUrl);
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

export default function EditChannelForm({
  initialChannel,
  appUrl,
}: {
  initialChannel: ChannelData;
  appUrl: string;
}) {
  const router = useRouter();

  const [name, setName] = useState(initialChannel.name);
  const [config, setConfig] = useState<Record<string, unknown>>(
    initialChannel.config || {}
  );
  const [enabled, setEnabled] = useState(initialChannel.enabled);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [connectionCount, setConnectionCount] = useState<number | null>(null);
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  useEffect(() => {
    if (initialChannel.type !== "sse") return;
    const poll = () => getSseConnectionCount(initialChannel.id).then(setConnectionCount).catch(() => {});
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [initialChannel.id, initialChannel.type]);

  const handler = getChannelMeta(initialChannel.type);

  const webhookConflict =
    initialChannel.type === "webhook" &&
    typeof config.url === "string" &&
    config.url.length > 0 &&
    compareHosts(config.url, appUrl);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateChannel(initialChannel.id, { name, config, enabled });
      toast.success("Channel updated");
      router.push("/channels");
    } catch (err) {
      showError(err, "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      await testChannel(initialChannel.id);
      toast.success("Test message sent successfully");
    } catch (err) {
      showError(err, "Test failed");
    } finally {
      setTesting(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteChannel(initialChannel.id);
      toast.success("Channel deleted");
      router.push("/channels");
    } catch (err) {
      showError(err, "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/channels")}
        >
          <ArrowLeft data-icon />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">
          Edit {handler?.displayName || initialChannel.type}
        </h1>
      </div>

      <div className="mt-6 flex flex-col lg:flex-row gap-6">
        {/* Config form — left side */}
        <form onSubmit={handleSave} className="flex-1 min-w-0 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="channel-name">Channel name</Label>
            <Input
              id="channel-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={saving}
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={saving}
            />
            <Label>{enabled ? "Active" : "Disabled"}</Label>
          </div>

          {initialChannel.type === "sse" && connectionCount !== null && (
            <div className="flex items-center gap-2">
              <span className={`inline-block size-2 rounded-full ${connectionCount > 0 ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
              <span className="text-sm text-muted-foreground">
                {connectionCount === 0
                  ? "No active connections"
                  : `${connectionCount} active connection${connectionCount !== 1 ? "s" : ""}`}
              </span>
            </div>
          )}

          {initialChannel.type === "sse" && origin && (
            <div className="space-y-2">
              <Label>Stream URL</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border bg-muted px-3 py-2 text-sm font-mono break-all">
                  {`${origin}/api/stream/${initialChannel.publicId}`}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${origin}/api/stream/${initialChannel.publicId}`
                    );
                    toast.success("Stream URL copied");
                  }}
                >
                  <Copy data-icon />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Use this URL with EventSource in a browser or{" "}
                <code className="rounded bg-muted px-1 text-xs">curl -N</code>
              </p>
            </div>
          )}

          {initialChannel.type === "webhook" && (
            <WebhookHostHint
              url={(config.url as string) || ""}
              appUrl={appUrl}
            />
          )}

          {handler && (
            <ChannelConfigForm
              fields={handler.configFields}
              values={config}
              onChange={setConfig}
            />
          )}

          <div className="flex gap-3 flex-wrap">
            <Button type="submit" disabled={saving || deleting || webhookConflict}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
            {handler?.hasTest && (
              <Button
                type="button"
                variant="outline"
                disabled={testing || saving || webhookConflict}
                onClick={handleTest}
              >
                {testing ? "Sending test..." : "Send test message"}
              </Button>
            )}
            <ConfirmDialog
              trigger={
                <Button
                  type="button"
                  variant="destructive"
                  disabled={saving || deleting}
                >
                  {deleting ? "Deleting..." : "Delete"}
                </Button>
              }
              title="Delete channel?"
              description="This will permanently delete this channel. Webhooks linked to it will no longer deliver to this channel."
              confirmLabel="Delete channel"
              onConfirm={handleDelete}
            />
          </div>
        </form>

        {/* Setup guide — right side on large screens, below on small */}
        {handler?.setupGuide && (
          <div className="lg:w-[400px] lg:shrink-0">
            <div className="lg:sticky lg:top-6">
              <SetupGuidePanel guide={handler.setupGuide} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
