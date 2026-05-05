import { redirect } from "next/navigation";
import Link from "next/link";
import { getWebhookById } from "../actions";
import { getMemberRole } from "@/lib/auth/server";
import { Button } from "@/components/ui/button";
import { WebhookCredentials } from "./webhook-credentials";
import { WebhookExamples } from "./webhook-examples";
import { WebhookChannels } from "./webhook-channels";
import { ArrowLeft } from "lucide-react";

export default async function WebhookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [webhook, role] = await Promise.all([
    getWebhookById(id),
    getMemberRole(),
  ]);

  if (!webhook) {
    redirect("/webhooks");
  }
  const isAdminOrOwner = role === "owner" || role === "admin";

  const endpointUrl = `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/n/${webhook.publicId}`;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/webhooks">
            <Button variant="ghost" size="icon">
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
        {isAdminOrOwner && (
          <Link href={`/webhooks/${webhook.id}/edit`}>
            <Button variant="outline">Edit</Button>
          </Link>
        )}
      </div>

      <div className="mt-6 space-y-6">
        <WebhookCredentials
          webhookId={webhook.id}
          apiKey={webhook.requireAuth ? webhook.apiKey : ""}
          endpointUrl={endpointUrl}
          requireAuth={webhook.requireAuth}
        />

        <WebhookChannels
          webhookId={webhook.id}
          channels={webhook.channels}
          isAdminOrOwner={isAdminOrOwner}
        />

        <WebhookExamples
          endpointUrl={endpointUrl}
          apiKey={webhook.requireAuth ? webhook.apiKey : ""}
          requireAuth={webhook.requireAuth}
        />
      </div>
    </div>
  );
}
