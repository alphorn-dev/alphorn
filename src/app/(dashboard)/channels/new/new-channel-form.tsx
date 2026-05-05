"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAllChannelMeta } from "@/channels/meta";
import { createChannel, testChannelConfig } from "../actions";
import { ChannelConfigForm, SetupGuidePanel } from "@/components/channel-config-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Search } from "lucide-react";
import { ChannelIcon } from "@/components/channel-icons";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import { compareHosts } from "@/lib/webhook-loop/same-host";

const CATEGORIES: Record<string, string[]> = {
  "Chat & Messaging": ["telegram", "discord", "slack", "teams", "google-chat", "matrix", "mattermost", "rocketchat", "zulip"],
  "Push Notifications": ["ntfy", "pushover", "gotify"],
  "Incident Management": ["pagerduty", "opsgenie"],
  "Email": ["smtp", "sendgrid", "mailgun"],
  "SMS": ["twilio-sms", "vonage-sms"],
  "Other": ["webhook", "sse"],
};

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

export default function NewChannelForm({ appUrl }: { appUrl: string }) {
  const router = useRouter();
  const handlers = getAllChannelMeta();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [search, setSearch] = useState("");

  const handler = handlers.find((h) => h.type === selectedType);

  const webhookConflict =
    selectedType === "webhook" &&
    typeof config.url === "string" &&
    config.url.length > 0 &&
    compareHosts(config.url, appUrl);

  const filtered = useMemo(() => {
    if (!search.trim()) return handlers;
    const q = search.toLowerCase();
    return handlers.filter(
      (h) =>
        h.displayName.toLowerCase().includes(q) ||
        h.type.toLowerCase().includes(q)
    );
  }, [handlers, search]);

  const filteredTypes = new Set(filtered.map((h) => h.type));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedType || !handler) return;

    setSaving(true);
    try {
      await createChannel({ name, type: selectedType, config });
      toast.success("Channel created");
      router.push("/channels");
    } catch (err) {
      showError(err, "Failed to create channel");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!selectedType) return;
    setTesting(true);
    try {
      await testChannelConfig({ type: selectedType, config });
      toast.success("Test message sent successfully");
    } catch (err) {
      showError(err, "Test failed");
    } finally {
      setTesting(false);
    }
  }

  if (!selectedType) {
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
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Add channel</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a notification channel type.
            </p>
          </div>
        </div>

        <div className="relative mt-6">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search channels..."
            className="pl-9"
          />
        </div>

        {filtered.length === 0 ? (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            No channels matching &ldquo;{search}&rdquo;
          </p>
        ) : (
          <div className="mt-6 space-y-8">
            {Object.entries(CATEGORIES).map(([category, types]) => {
              const items = types
                .map((t) => handlers.find((h) => h.type === t))
                .filter((h): h is NonNullable<typeof h> => h != null && filteredTypes.has(h.type));
              if (items.length === 0) return null;
              return (
                <div key={category}>
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {category}
                  </h2>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((h) => (
                      <button
                        key={h.type}
                        type="button"
                        className="flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => {
                          setSelectedType(h.type);
                          setName(h.displayName);
                          const defaults: Record<string, unknown> = {};
                          for (const f of h.configFields) {
                            if (f.default !== undefined) defaults[f.key] = f.default;
                          }
                          setConfig(defaults);
                        }}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-background">
                          <ChannelIcon icon={h.icon} className="h-6 w-6" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{h.displayName}</div>
                          <div className="text-xs text-muted-foreground">{h.description}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setSelectedType(null);
            setConfig({});
          }}
        >
          <ArrowLeft data-icon />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Configure {handler?.displayName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{handler?.description}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Config form — left side */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="channel-name">Channel name</Label>
            <Input
              id="channel-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My Telegram"
              required
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              A friendly name to identify this channel
            </p>
          </div>

          {selectedType === "webhook" && (
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
            <Button type="submit" disabled={saving || testing || webhookConflict}>
              {saving ? "Creating..." : "Create channel"}
            </Button>
            {handler?.hasTest && (
              <Button
                type="button"
                variant="outline"
                onClick={handleTest}
                disabled={saving || testing || webhookConflict}
              >
                {testing ? "Sending test..." : "Send test message"}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/channels")}
              disabled={saving || testing}
            >
              Cancel
            </Button>
          </div>
        </form>

        {/* Setup guide — right side */}
        {handler?.setupGuide && (
          <div>
            <div className="lg:sticky lg:top-6">
              <SetupGuidePanel guide={handler.setupGuide} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
