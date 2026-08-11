"use client";

import { useState } from "react";
import { regenerateApiKey, regeneratePublicId, updateWebhookRequireAuth } from "../actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
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
import { Switch } from "@/components/ui/switch";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export function WebhookCredentials({
  webhookId,
  apiKeyPrefix,
  endpointUrl: initialEndpointUrl,
  requireAuth: initialRequireAuth,
}: {
  webhookId: string;
  apiKeyPrefix: string;
  endpointUrl: string;
  requireAuth: boolean;
}) {
  // The full key only exists in memory right after regenerate — it is never
  // stored, so once this reveal is gone the user must regenerate again.
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [endpointUrl, setEndpointUrl] = useState(initialEndpointUrl);
  const [requireAuth, setRequireAuth] = useState(initialRequireAuth);
  const [regenerating, setRegenerating] = useState(false);
  const [regeneratingUrl, setRegeneratingUrl] = useState(false);

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const newKey = await regenerateApiKey(webhookId);
      setRevealedKey(newKey);
      toast.success("API key regenerated");
    } catch {
      toast.error("Failed to regenerate API key");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleRegenerateUrl() {
    setRegeneratingUrl(true);
    try {
      const newPublicId = await regeneratePublicId(webhookId);
      setEndpointUrl(endpointUrl.replace(/\/n\/[^/]+$/, `/n/${newPublicId}`));
      toast.success("Endpoint URL regenerated");
    } catch {
      toast.error("Failed to regenerate URL");
    } finally {
      setRegeneratingUrl(false);
    }
  }

  async function handleToggleAuth(checked: boolean) {
    setRequireAuth(checked);
    try {
      await updateWebhookRequireAuth(webhookId, checked);
      toast.success(checked ? "API key required" : "API key disabled — URL is the secret");
    } catch {
      setRequireAuth(!checked);
      toast.error("Failed to update auth setting");
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credentials</CardTitle>
        <CardDescription>
          Use these to send notifications to this webhook.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Endpoint URL</Label>
          <div className="flex gap-2">
            <Input value={endpointUrl} readOnly className="font-mono text-sm" />
            <Button
              variant="outline"
              size="icon"
              onClick={() => copyToClipboard(endpointUrl)}
              title="Copy"
            >
              <Copy data-icon />
            </Button>
          </div>
          <ConfirmDialog
            trigger={
              <Button variant="outline" size="sm" disabled={regeneratingUrl}>
                <RefreshCw data-icon="inline-start" />
                {regeneratingUrl ? "Regenerating..." : "Regenerate URL"}
              </Button>
            }
            title="Regenerate endpoint URL?"
            description="The current URL will stop working immediately. Any scripts using this URL will need to be updated."
            confirmLabel="Regenerate"
            onConfirm={handleRegenerateUrl}
          />
        </div>

        <div className="flex items-center gap-3">
          <Switch
            checked={requireAuth}
            onCheckedChange={handleToggleAuth}
          />
          <Label>Require API key</Label>
        </div>

        {!requireAuth && (
          <p className="text-sm text-muted-foreground">
            The endpoint URL acts as the secret. Anyone with the URL can send notifications.
          </p>
        )}

        {requireAuth && (
          <div className="space-y-2">
            <Label>API Key</Label>
            {revealedKey ? (
              <>
                <div className="flex gap-2">
                  <Input
                    value={revealedKey}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(revealedKey)}
                    title="Copy"
                  >
                    <Copy data-icon />
                  </Button>
                </div>
                <p className="text-sm text-warning">
                  Copy this key now — it is shown only once and cannot be
                  retrieved later.
                </p>
              </>
            ) : (
              <>
                <Input
                  value={apiKeyPrefix + "…"}
                  readOnly
                  className="font-mono text-sm"
                />
                <p className="text-sm text-muted-foreground">
                  The full key is shown only once, when created. Regenerate to
                  get a new key.
                </p>
              </>
            )}
            <ConfirmDialog
              trigger={
                <Button variant="destructive" size="sm" disabled={regenerating}>
                  <RefreshCw data-icon="inline-start" />
                  {regenerating ? "Regenerating..." : "Regenerate key"}
                </Button>
              }
              title="Regenerate API key?"
              description="The current API key will stop working immediately. Any applications using this key will need to be updated."
              confirmLabel="Regenerate"
              onConfirm={handleRegenerate}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
