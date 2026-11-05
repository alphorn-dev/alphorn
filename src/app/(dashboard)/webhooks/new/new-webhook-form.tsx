"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createWebhook } from "../actions";
import { ChannelSelector } from "@/components/channel-selector";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  MessageFormatFields,
  EMPTY_TEMPLATES,
  type MessageTemplates,
} from "@/components/message-format-fields";
import type { ExtractMode } from "@/lib/webhook-extract/mode";
import { ArrowLeft, Copy } from "lucide-react";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import { type ChannelSelection, validateFilter } from "@/lib/filter/schema";
import type { ChannelOption } from "@/channels/types";

export default function NewWebhookForm({
  channels,
  availableTags,
}: {
  channels: ChannelOption[];
  availableTags: string[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedChannels, setSelectedChannels] = useState<ChannelSelection[]>([]);
  const [requireAuth, setRequireAuth] = useState(false);
  const [extractMode, setExtractMode] = useState<ExtractMode>("auto");
  const [templates, setTemplates] = useState<MessageTemplates>(EMPTY_TEMPLATES);
  const [saving, setSaving] = useState(false);
  // Set once the webhook is created; holds the one-time plaintext key to reveal.
  const [created, setCreated] = useState<{ id: string; apiKey: string | null } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    for (const sel of selectedChannels) {
      const err = validateFilter(sel.filter);
      if (err) {
        showError(err, "Invalid filter");
        return;
      }
    }

    setSaving(true);
    try {
      const { id, apiKey } = await createWebhook({
        name,
        description: description || undefined,
        requireAuth,
        channelIds: selectedChannels.map((s) => s.channelId),
        channelFilters: Object.fromEntries(
          selectedChannels.map((s) => [s.channelId, s.filter])
        ),
        extractMode,
        titleTemplate: templates.titleTemplate || null,
        messageTemplate: templates.messageTemplate || null,
        tagsTemplate: templates.tagsTemplate || null,
        priorityTemplate: templates.priorityTemplate || null,
      });
      toast.success("Webhook created");
      // The plaintext key is returned once and never stored — reveal it here
      // before moving on. If auth is off, there is no key to show.
      setCreated({ id, apiKey: requireAuth ? apiKey : null });
    } catch (err) {
      showError(err, "Failed to create webhook");
    } finally {
      setSaving(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }

  if (created) {
    return (
      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Webhook created</CardTitle>
            <CardDescription>
              {created.apiKey
                ? "Copy your API key now — it is shown only once and cannot be retrieved later."
                : "Your webhook is ready. The endpoint URL is the secret; keep it private."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {created.apiKey && (
              <div className="space-y-2">
                <Label>API Key</Label>
                <div className="flex gap-2">
                  <Input
                    value={created.apiKey}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(created.apiKey!)}
                    title="Copy"
                  >
                    <Copy data-icon />
                  </Button>
                </div>
                <p className="text-sm text-warning">
                  Store it somewhere safe now. You can regenerate it later, but
                  you cannot view this key again.
                </p>
              </div>
            )}
            <div className="flex gap-3">
              <Button onClick={() => router.push(`/webhooks/${created.id}`)}>
                Go to webhook
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/webhooks")}
        >
          <ArrowLeft data-icon />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create webhook</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a new inbound webhook endpoint.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="webhook-name">Name</Label>
          <Input
            id="webhook-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Form Submissions"
            required
            disabled={saving}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="webhook-desc">Description (optional)</Label>
          <Textarea
            id="webhook-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this webhook is used for..."
            disabled={saving}
          />
        </div>

        <div className="space-y-2">
          <Label>Output channels</Label>
          <p className="text-xs text-muted-foreground">
            Select which channels should receive notifications from this
            webhook.
          </p>
          <ChannelSelector
            channels={channels}
            selected={selectedChannels}
            onChange={setSelectedChannels}
            availableTags={availableTags}
          />
        </div>

        <div className="flex items-center gap-3">
          <Switch
            checked={requireAuth}
            onCheckedChange={setRequireAuth}
            disabled={saving}
          />
          <Label>{requireAuth ? "API key required" : "No API key (URL is the secret)"}</Label>
        </div>

        <div className="rounded-md border p-4">
          <MessageFormatFields
            mode={extractMode}
            templates={templates}
            onChange={(mode, next) => {
              setExtractMode(mode);
              setTemplates(next);
            }}
            disabled={saving}
          />
        </div>

        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Creating..." : "Create webhook"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/webhooks")}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
