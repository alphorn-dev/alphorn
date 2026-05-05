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
import { Copy, Eye, EyeOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export function WebhookCredentials({
  webhookId,
  apiKey: initialApiKey,
  endpointUrl: initialEndpointUrl,
  requireAuth: initialRequireAuth,
}: {
  webhookId: string;
  apiKey: string;
  endpointUrl: string;
  requireAuth: boolean;
}) {
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [endpointUrl, setEndpointUrl] = useState(initialEndpointUrl);
  const [requireAuth, setRequireAuth] = useState(initialRequireAuth);
  const [showKey, setShowKey] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regeneratingUrl, setRegeneratingUrl] = useState(false);

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const newKey = await regenerateApiKey(webhookId);
      setApiKey(newKey);
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
            <div className="flex gap-2">
              <Input
                value={showKey ? apiKey : "alp_" + "*".repeat(40)}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowKey(!showKey)}
                title={showKey ? "Hide" : "Show"}
              >
                {showKey ? (
                  <EyeOff data-icon />
                ) : (
                  <Eye data-icon />
                )}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(apiKey)}
                title="Copy"
              >
                <Copy data-icon />
              </Button>
            </div>
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
