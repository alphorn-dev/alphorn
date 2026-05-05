"use client";

import { useState } from "react";
import { updateWebhookChannels, toggleWebhookChannel } from "../actions";
import { getChannelsForOrg } from "../../channels/actions";
import { getAllTagsForOrg } from "../../messages/actions";
import { type FilterDefinition, type ChannelSelection, validateFilter } from "@/lib/filter/schema";
import { ChannelSelector } from "@/components/channel-selector";
import { ChannelIcon } from "@/components/channel-icons";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Filter, Pencil } from "lucide-react";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import type { ChannelOption } from "@/channels/types";

interface WebhookChannel {
  channelId: string;
  filter: unknown;
  enabled: boolean;
  channel: { name: string; type: string };
}

interface WebhookChannelsProps {
  webhookId: string;
  channels: WebhookChannel[];
  isAdminOrOwner: boolean;
}

export function WebhookChannels({ webhookId, channels: initialChannels, isAdminOrOwner }: WebhookChannelsProps) {
  const [channels, setChannels] = useState(initialChannels);
  const [editing, setEditing] = useState(false);
  const [allChannels, setAllChannels] = useState<ChannelOption[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<ChannelSelection[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [togglingChannels, setTogglingChannels] = useState<Set<string>>(new Set());

  function startEditing() {
    setLoadingOptions(true);
    setEditing(true);
    setSelectedChannels(
      channels.map((wc) => ({
        channelId: wc.channelId,
        filter: (wc.filter as FilterDefinition | null) ?? null,
      }))
    );
    Promise.all([getChannelsForOrg(), getAllTagsForOrg()]).then(([chs, tags]) => {
      setAllChannels(chs.map((c) => ({ id: c.id, name: c.name, type: c.type })));
      setAvailableTags(tags);
      setLoadingOptions(false);
    });
  }

  function cancelEditing() {
    setEditing(false);
  }

  async function handleToggle(channelId: string, enabled: boolean) {
    setTogglingChannels((prev) => new Set(prev).add(channelId));
    try {
      await toggleWebhookChannel(webhookId, channelId, enabled);
      setChannels((prev) =>
        prev.map((wc) =>
          wc.channelId === channelId ? { ...wc, enabled } : wc
        )
      );
    } catch (err) {
      showError(err, "Failed to toggle channel");
    } finally {
      setTogglingChannels((prev) => {
        const next = new Set(prev);
        next.delete(channelId);
        return next;
      });
    }
  }

  async function handleSave() {
    for (const sel of selectedChannels) {
      const err = validateFilter(sel.filter);
      if (err) {
        showError(err, "Invalid filter");
        return;
      }
    }

    setSaving(true);
    try {
      await updateWebhookChannels(webhookId, {
        channelIds: selectedChannels.map((s) => s.channelId),
        channelFilters: Object.fromEntries(
          selectedChannels.map((s) => [s.channelId, s.filter])
        ),
      });
      toast.success("Channels updated");
      setEditing(false);
    } catch (err) {
      showError(err, "Failed to update channels");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Output Channels</CardTitle>
          <CardDescription>
            Select channels and configure filters for this webhook.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingOptions ? (
            <p className="text-sm text-muted-foreground">Loading channels...</p>
          ) : (
            <ChannelSelector
              channels={allChannels}
              selected={selectedChannels}
              onChange={setSelectedChannels}
              availableTags={availableTags}
            />
          )}
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving || loadingOptions}>
              {saving ? "Saving..." : "Save channels"}
            </Button>
            <Button variant="outline" onClick={cancelEditing} disabled={saving}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Output Channels</CardTitle>
            <CardDescription>
              Notifications from this webhook are sent to these channels.
            </CardDescription>
          </div>
          {isAdminOrOwner && (
            <Button variant="outline" size="sm" onClick={startEditing}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {channels.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No channels linked.{" "}
            {isAdminOrOwner && (
              <button
                onClick={startEditing}
                className="text-primary underline"
              >
                Add channels
              </button>
            )}
          </p>
        ) : (
          <div className="space-y-2">
            {channels.map((wc) => (
              <div
                key={wc.channelId}
                className="flex items-center gap-3 rounded-md border px-3 py-2"
              >
                <ChannelIcon icon={wc.channel.type} className="h-5 w-5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-none">{wc.channel.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{wc.channel.type}</p>
                </div>
                {wc.filter ? (
                  <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                ) : null}
                {isAdminOrOwner && (
                  <Switch
                    checked={wc.enabled}
                    disabled={togglingChannels.has(wc.channelId)}
                    onCheckedChange={(checked) => handleToggle(wc.channelId, checked)}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
