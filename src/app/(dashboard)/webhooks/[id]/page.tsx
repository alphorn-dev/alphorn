import { redirect } from "next/navigation";
import Link from "next/link";
import { getWebhookById } from "../actions";
import { getRecentMessagesForWebhook } from "../../messages/actions";
import { DashboardRecentMessages } from "../../dashboard-recent-messages";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getMemberRole } from "@/lib/auth/server";
import { Button } from "@/components/ui/button";
import { WebhookCredentials } from "./webhook-credentials";
import { WebhookExamples } from "./webhook-examples";
import { WebhookChannels } from "./webhook-channels";
import { WebhookGithub } from "./webhook-github";
import { githubAppConfig, installUrl } from "@/lib/github/app";
import { ArrowLeft, Mail } from "lucide-react";
import { BreadcrumbLabel } from "@/components/breadcrumbs";
import { SendMessageDialog } from "../../messages/send-message-dialog";

export default async function WebhookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [webhook, role, recentMessages] = await Promise.all([
    getWebhookById(id),
    getMemberRole(),
    getRecentMessagesForWebhook(id),
  ]);

  if (!webhook) {
    redirect("/webhooks");
  }
  const isAdminOrOwner = role === "owner" || role === "admin";
  // GitHub-connected webhooks receive events via /api/github/webhook, so the
  // /n/ endpoint, API key and curl examples don't apply to them.
  const github = webhook.githubInstallation;
  const githubConfig = githubAppConfig();

  const endpointUrl = `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/n/${webhook.publicId}`;

  return (
    <div className="max-w-3xl">
      <BreadcrumbLabel segment={webhook.id} label={webhook.name} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/webhooks">
            <Button variant="ghost" size="icon" aria-label="Back to webhooks">
              <ArrowLeft data-icon />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{webhook.name}</h1>
            {webhook.description && (
              <p className="mt-1 text-muted-foreground">
                {webhook.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/messages?webhook=${webhook.id}`}>
            <Button variant="outline" className="gap-2">
              <Mail data-icon="inline-start" />
              View messages
            </Button>
          </Link>
          {isAdminOrOwner && webhook.enabled && (
            <SendMessageDialog
              webhook={{ id: webhook.id, name: webhook.name }}
              variant="outline"
              label="Send test"
            />
          )}
          {isAdminOrOwner && (
            <Link href={`/webhooks/${webhook.id}/edit`}>
              <Button variant="outline">Edit</Button>
            </Link>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {github ? (
          <WebhookGithub
            webhookId={webhook.id}
            manageUrl={githubConfig ? installUrl(githubConfig) : "https://github.com/settings/installations"}
            events={github.events}
            suspended={github.suspendedAt !== null}
            isAdminOrOwner={isAdminOrOwner}
          />
        ) : (
          <WebhookCredentials
            webhookId={webhook.id}
            apiKeyPrefix={webhook.apiKeyPrefix}
            endpointUrl={endpointUrl}
            requireAuth={webhook.requireAuth}
          />
        )}

        <WebhookChannels
          webhookId={webhook.id}
          channels={webhook.channels}
          isAdminOrOwner={isAdminOrOwner}
        />

        <Card>
          <CardHeader>
            <CardTitle>Recent Messages</CardTitle>
            <CardDescription>Last 5 notifications received on this webhook.</CardDescription>
          </CardHeader>
          <CardContent>
            <DashboardRecentMessages
              messages={recentMessages}
              hideWebhook
              showAllHref={`/messages?webhook=${webhook.id}`}
              emptyText="No messages received yet. Send a test or call the endpoint URL."
            />
          </CardContent>
        </Card>

        {!github && (
          <WebhookExamples
            endpointUrl={endpointUrl}
            requireAuth={webhook.requireAuth}
          />
        )}
      </div>
    </div>
  );
}
