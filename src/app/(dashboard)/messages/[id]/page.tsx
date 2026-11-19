import { notFound } from "next/navigation";
import Link from "next/link";
import { getMessageById } from "../actions";
import { DeliveriesTable } from "./deliveries-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { BreadcrumbLabel } from "@/components/breadcrumbs";
import { CopyButton } from "@/components/copy-button";
import { PriorityBadge } from "@/components/priority-badge";
import { formatDateTime } from "@/lib/format-date";
import { getMemberRole } from "@/lib/auth/server";
import { isWithinRetryWindow } from "@/worker/deliver";

export default async function MessageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [message, role] = await Promise.all([getMessageById(id), getMemberRole()]);

  if (!message) {
    notFound();
  }

  return (
    <div className="max-w-3xl">
      <BreadcrumbLabel segment={message.id} label={message.title ?? "Untitled"} />
      <div className="flex items-center gap-4">
        <Link href="/messages">
          <Button variant="ghost" size="icon" aria-label="Back to messages">
            <ArrowLeft data-icon />
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight break-words">{message.title ?? <span className="text-muted-foreground italic">Untitled</span>}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            via{" "}
            {message.webhook.deletedAt ? (
              message.webhook.name
            ) : (
              <Link href={`/webhooks/${message.webhook.id}`} className="hover:text-foreground hover:underline">
                {message.webhook.name}
              </Link>
            )}{" "}
            &middot; {formatDateTime(message.createdAt)}
          </p>
        </div>
        <CopyButton
          value={message.id}
          label="Copy message ID"
          toastMessage="Message ID copied"
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground"
        >
          ID
        </CopyButton>
      </div>

      {(message.tags.length > 0 || message.priority != null) && (
        <div className="mt-6 flex items-center gap-2 flex-wrap">
          {message.priority != null && (
            <PriorityBadge priority={message.priority} />
          )}
          {message.tags.map((tag) => (
            <Link key={tag} href={`/messages?tag=${encodeURIComponent(tag)}`} title={`Messages tagged ${tag}`}>
              <Badge variant="outline" className="hover:bg-muted">
                {tag}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      {message.message && (
        <Card className="mt-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Message</CardTitle>
            <CopyButton value={message.message} label="Copy message" variant="ghost" size="icon-sm" />
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{message.message}</p>
          </CardContent>
        </Card>
      )}

      {message.payload && (
        <Card className="mt-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Full Payload</CardTitle>
            <CopyButton
              value={JSON.stringify(message.payload, null, 2)}
              label="Copy payload"
              toastMessage="Payload copied"
              variant="ghost"
              size="icon-sm"
            />
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 text-sm">
              {JSON.stringify(message.payload, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Deliveries</CardTitle>
          <CardDescription>
            Status of each notification delivery.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeliveriesTable
            messageId={message.id}
            isAdminOrOwner={role === "owner" || role === "admin"}
            // Deliveries are created with their message; the worker never sends
            // rows past the retry window, so resend would only fail.
            canResend={isWithinRetryWindow(message.createdAt)}
            initialDeliveries={message.deliveries.map((d) => ({
              id: d.id,
              channelId: d.channelId,
              status: d.status,
              attempts: d.attempts,
              lastError: d.lastError,
              channel: {
                id: d.channel.id,
                name: d.channel.name,
                type: d.channel.type,
              },
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
