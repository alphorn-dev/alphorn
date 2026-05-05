"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createWebhook } from "../actions";
import { ChannelSelector } from "@/components/channel-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft } from "lucide-react";
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
  const [requireAuth, setRequireAuth] = useState(true);
  const [titleTemplate, setTitleTemplate] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [tagsTemplate, setTagsTemplate] = useState("");
  const [priorityTemplate, setPriorityTemplate] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);

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
      await createWebhook({
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
      router.push("/webhooks");
    } catch (err) {
      showError(err, "Failed to create webhook");
    } finally {
      setSaving(false);
    }
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
