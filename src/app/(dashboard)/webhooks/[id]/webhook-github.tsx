"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { updateGithubEvents } from "../actions";
import { GITHUB_EVENTS } from "@/lib/github/events";
import { showError } from "@/lib/toast-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface WebhookGithubProps {
  webhookId: string;
  manageUrl: string;
  events: string[];
  suspended: boolean;
  isAdminOrOwner: boolean;
}

export function WebhookGithub({
  webhookId,
  manageUrl,
  events: initialEvents,
  suspended,
  isAdminOrOwner,
}: WebhookGithubProps) {
  const [events, setEvents] = useState(new Set(initialEvents));
  const [saved, setSaved] = useState(new Set(initialEvents));
  const [saving, setSaving] = useState(false);
  const dirty =
    events.size !== saved.size || [...events].some((e) => !saved.has(e));

  function toggle(id: string) {
    setEvents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await updateGithubEvents(webhookId, [...events]);
      setSaved(new Set(events));
      toast.success("GitHub events updated");
    } catch (err) {
      showError(err, "Failed to update GitHub events");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          GitHub
          {suspended && <Badge variant="secondary">Suspended</Badge>}
        </CardTitle>
        <CardDescription>
          Events from the repositories selected in the GitHub App installation
          arrive here automatically. Choose which events become messages.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {GITHUB_EVENTS.map((e) => (
            <label key={e.id} className="flex items-center gap-3 rounded-md border p-3">
              <Checkbox
                checked={events.has(e.id)}
                onCheckedChange={() => toggle(e.id)}
                disabled={!isAdminOrOwner || saving}
              />
              <Label className="font-normal">{e.label}</Label>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdminOrOwner && (
            <Button onClick={save} disabled={!dirty || saving}>
              {saving ? "Saving..." : "Save events"}
            </Button>
          )}
          <a
            href={manageUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline">
              Manage repositories
              <ExternalLink data-icon />
            </Button>
          </a>
        </div>
        <p className="text-xs text-muted-foreground">
          Deleting this webhook disconnects it from Alphorn. To remove the app&apos;s
          access to your repositories, uninstall it on GitHub.
        </p>
      </CardContent>
    </Card>
  );
}
