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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SOURCE_PRESETS, getSourcePreset } from "@/lib/webhook-extract/presets";
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
  const [titleTemplate, setTitleTemplate] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [tagsTemplate, setTagsTemplate] = useState("");
  const [priorityTemplate, setPriorityTemplate] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
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
        titleTemplate: titleTemplate || null,
        messageTemplate: messageTemplate || null,
        tagsTemplate: tagsTemplate || null,
        priorityTemplate: priorityTemplate || null,
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

  function applyPreset(id: string) {
    const preset = getSourcePreset(id);
    if (!preset) return;
    setTitleTemplate(preset.titleTemplate);
    setMessageTemplate(preset.messageTemplate);
    setTagsTemplate(preset.tagsTemplate);
    setPriorityTemplate(preset.priorityTemplate);
    setAdvancedOpen(true);
    toast.success(`Applied ${preset.label} preset`);
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

        <div className="space-y-3 rounded-md border p-4">
          <button
            type="button"
            className="text-sm font-medium"
            onClick={() => setAdvancedOpen((o) => !o)}
          >
            {advancedOpen ? "▼" : "▶"} Advanced: field templates
          </button>
          {advancedOpen && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Override how title, message, tags and priority are extracted
                from the incoming payload. Use <code>{"{path.to.field}"}</code>{" "}
                syntax — e.g. <code>{"{issue.title}"}</code>. Leave empty to use
                automatic detection.
              </p>
              <div className="space-y-2">
                <Label>Source preset (optional)</Label>
                <Select
                  onValueChange={(v) => {
                    if (typeof v === "string") applyPreset(v);
                  }}
                  disabled={saving}
                >
                  <SelectTrigger className="w-full max-w-xs">
                    <SelectValue placeholder="Fill templates from a known source…" />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_PRESETS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Pre-fills the template fields below for a common webhook
                  source. You can edit them afterwards.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="title-tpl">Title template</Label>
                <Input
                  id="title-tpl"
                  value={titleTemplate}
                  onChange={(e) => setTitleTemplate(e.target.value)}
                  placeholder="{action}: {issue.title}"
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="message-tpl">Message template</Label>
                <Textarea
                  id="message-tpl"
                  value={messageTemplate}
                  onChange={(e) => setMessageTemplate(e.target.value)}
                  placeholder="{issue.body}"
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tags-tpl">Tags template (comma-separated)</Label>
                <Input
                  id="tags-tpl"
                  value={tagsTemplate}
                  onChange={(e) => setTagsTemplate(e.target.value)}
                  placeholder="github,{repository.name}"
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority-tpl">Priority template (number)</Label>
                <Input
                  id="priority-tpl"
                  value={priorityTemplate}
                  onChange={(e) => setPriorityTemplate(e.target.value)}
                  placeholder="{severity}"
                  disabled={saving}
                />
              </div>
            </div>
          )}
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
