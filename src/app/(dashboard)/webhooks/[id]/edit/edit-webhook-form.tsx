"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateWebhook, deleteWebhook } from "../../actions";
import { type FilterDefinition, type ChannelSelection, validateFilter } from "@/lib/filter/schema";
import { ChannelSelector } from "@/components/channel-selector";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import type { ChannelOption } from "@/channels/types";

interface WebhookData {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  requireAuth: boolean;
  channels: { channelId: string; filter: unknown }[];
  titleTemplate: string | null;
  messageTemplate: string | null;
  tagsTemplate: string | null;
  priorityTemplate: string | null;
}

export default function EditWebhookForm({
  webhook,
  channels,
  availableTags,
}: {
  webhook: WebhookData;
  channels: ChannelOption[];
  availableTags: string[];
}) {
  const router = useRouter();

  const [name, setName] = useState(webhook.name);
  const [description, setDescription] = useState(webhook.description || "");
  const [enabled, setEnabled] = useState(webhook.enabled);
  const [requireAuth, setRequireAuth] = useState(webhook.requireAuth);
  const [selectedChannels, setSelectedChannels] = useState<ChannelSelection[]>(
    webhook.channels.map((wc) => ({
      channelId: wc.channelId,
      filter: (wc.filter as FilterDefinition | null) ?? null,
    }))
  );
  const [titleTemplate, setTitleTemplate] = useState(webhook.titleTemplate ?? "");
  const [messageTemplate, setMessageTemplate] = useState(webhook.messageTemplate ?? "");
  const [tagsTemplate, setTagsTemplate] = useState(webhook.tagsTemplate ?? "");
  const [priorityTemplate, setPriorityTemplate] = useState(webhook.priorityTemplate ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(
    Boolean(
      webhook.titleTemplate ||
      webhook.messageTemplate ||
      webhook.tagsTemplate ||
      webhook.priorityTemplate
    )
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave(e: React.FormEvent) {
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
      await updateWebhook(webhook.id, {
        name,
        description: description || undefined,
        enabled,
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
      toast.success("Webhook updated");
      router.push("/webhooks");
    } catch (err) {
      showError(err, "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteWebhook(webhook.id);
      toast.success("Webhook deleted");
      router.push("/webhooks");
    } catch (err) {
      showError(err, "Failed to delete");
    } finally {
      setDeleting(false);
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
        <h1 className="text-2xl font-bold tracking-tight">Edit webhook</h1>
      </div>

      <form onSubmit={handleSave} className="mt-6 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="webhook-name">Name</Label>
          <Input
            id="webhook-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={saving}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="webhook-desc">Description</Label>
          <Textarea
            id="webhook-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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

        <div className="flex items-center gap-3">
          <Switch
            checked={requireAuth}
            onCheckedChange={setRequireAuth}
            disabled={saving}
          />
          <Label>{requireAuth ? "API key required" : "No API key (URL is the secret)"}</Label>
        </div>

        <div className="space-y-2">
          <Label>Output channels</Label>
          <ChannelSelector
            channels={channels}
            selected={selectedChannels}
            onChange={setSelectedChannels}
            availableTags={availableTags}
          />
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
          <Button type="submit" disabled={saving || deleting}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
          <ConfirmDialog
            trigger={
              <Button
                type="button"
                variant="destructive"
                disabled={saving || deleting}
              >
                {deleting ? "Deleting..." : "Delete webhook"}
              </Button>
            }
            title="Delete webhook?"
            description="This will permanently delete this webhook and all its message history. This action cannot be undone."
            confirmLabel="Delete webhook"
            onConfirm={handleDelete}
          />
        </div>
      </form>
    </div>
  );
}
