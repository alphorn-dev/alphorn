"use client";

import { useState } from "react";
import { updateOrgSettings } from "./actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChannelIcon } from "@/components/channel-icons";
import { BellOff } from "lucide-react";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import type { ChannelOption } from "@/channels/types";

const typeLabels: Record<string, string> = {
  telegram: "Telegram",
  discord: "Discord",
  slack: "Slack",
  "microsoft-teams": "Teams",
  "google-chat": "Google Chat",
  matrix: "Matrix",
  mattermost: "Mattermost",
  webhook: "Webhook",
  ntfy: "ntfy",
  pushover: "Pushover",
  gotify: "Gotify",
  twilio: "SMS",
  email: "Email",
  sse: "SSE",
};

export function SettingsForm({
  currentFailureNotificationChannelId,
  channels,
}: {
  currentFailureNotificationChannelId: string | null;
  channels: ChannelOption[];
}) {
  const [failureNotificationChannelId, setFailureNotificationChannelId] = useState(
    currentFailureNotificationChannelId || "none"
  );
  const [saving, setSaving] = useState(false);

  const selectedChannel = channels.find((c) => c.id === failureNotificationChannelId);

  async function handleSave() {
    setSaving(true);
    try {
      await updateOrgSettings({
        failureNotificationChannelId:
          failureNotificationChannelId === "none" ? null : failureNotificationChannelId,
      });
      toast.success("Settings saved");
    } catch (err) {
      showError(err, "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Failure Notifications</CardTitle>
        <CardDescription>
          Get notified when a delivery permanently fails after all retries.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Notification channel</Label>
          <Select
            value={failureNotificationChannelId}
            onValueChange={(v) => setFailureNotificationChannelId(v || "none")}
          >
            <SelectTrigger className="w-full max-w-md">
              <SelectValue>
                {selectedChannel ? (
                  <span className="flex items-center gap-2">
                    <ChannelIcon icon={selectedChannel.type} className="h-4 w-4 shrink-0" />
                    <span className="truncate">{selectedChannel.name}</span>
                    <span className="text-muted-foreground">{typeLabels[selectedChannel.type] ?? selectedChannel.type}</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <BellOff className="h-4 w-4 shrink-0" />
                    None (disabled)
                  </span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="flex items-center gap-2">
                  <BellOff className="h-4 w-4 shrink-0 text-muted-foreground" />
                  None (disabled)
                </span>
              </SelectItem>
              {channels.map((ch) => (
                <SelectItem key={ch.id} value={ch.id}>
                  <span className="flex items-center gap-2">
                    <ChannelIcon icon={ch.type} className="h-4 w-4 shrink-0" />
                    <span className="truncate">{ch.name}</span>
                    <span className="text-muted-foreground text-xs">{typeLabels[ch.type] ?? ch.type}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Fires when a delivery permanently fails after all retries are exhausted.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
