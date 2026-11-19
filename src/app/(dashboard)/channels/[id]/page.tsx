import { notFound } from "next/navigation";
import Link from "next/link";
import { getChannelDeliveryStats, getChannelSummary } from "../actions";
import { ExpandableError } from "@/components/expandable-error";
import { RelativeTime } from "@/components/relative-time";
import { getMemberRole } from "@/lib/auth/server";
import { getChannelMeta } from "@/channels/meta";
import { BreadcrumbLabel } from "@/components/breadcrumbs";
import { ChannelIcon } from "@/components/channel-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, Filter, Mail } from "lucide-react";
import { formatDate } from "@/lib/format-date";

// Read-only view for every member; credentials stay on the admin-only edit page.
export default async function ChannelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [channel, role, stats] = await Promise.all([
    getChannelSummary(id),
    getMemberRole(),
    getChannelDeliveryStats(id),
  ]);
  if (!channel) notFound();
  const isAdminOrOwner = role === "owner" || role === "admin";
  const meta = getChannelMeta(channel.type);

  return (
    <div className="max-w-3xl">
      <BreadcrumbLabel segment={channel.id} label={channel.name} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/channels">
            <Button variant="ghost" size="icon" aria-label="Back to channels">
              <ArrowLeft data-icon />
            </Button>
          </Link>
          <ChannelIcon icon={channel.type} className="size-8 shrink-0" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight">{channel.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {meta?.displayName ?? channel.type} &middot; created {formatDate(channel.createdAt)}
            </p>
          </div>
          {channel.enabled ? (
            <Badge className="border-success/20 bg-success-muted text-success hover:bg-success-muted">
              Active
            </Badge>
          ) : (
            <Badge variant="secondary">Disabled</Badge>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href={`/messages?channel=${channel.id}`}>
            <Button variant="outline" className="gap-2">
              <Mail data-icon="inline-start" />
              View messages
            </Button>
          </Link>
          {isAdminOrOwner && (
            <Link href={`/channels/${channel.id}/edit`}>
              <Button variant="outline">Edit</Button>
            </Link>
          )}
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Deliveries</CardTitle>
          <CardDescription>Last {stats.days} days.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: "Success rate", value: stats.successRate === null ? "-" : `${stats.successRate}%`, href: null },
              { label: "Delivered", value: stats.delivered, href: `/messages?channel=${channel.id}&status=DELIVERED`, className: "text-success" },
              { label: "Failed", value: stats.failed, href: `/messages?channel=${channel.id}&status=FAILED,STALE`, className: "text-destructive" },
              { label: "Pending", value: stats.pending, href: `/messages?channel=${channel.id}&status=PENDING,PROCESSING`, className: "text-info" },
            ].map((s) => (
              <div key={s.label}>
                <dt className="text-sm text-muted-foreground">{s.label}</dt>
                <dd className={`text-2xl font-bold tabular-nums ${s.className ?? ""}`}>
                  {s.href ? (
                    <Link href={s.href} className="hover:underline">{s.value}</Link>
                  ) : (
                    s.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {stats.lastFailure && (
            <div className="space-y-1 rounded-md border p-3">
              <p className="text-sm font-medium">
                Last failure{" "}
                <span className="font-normal text-muted-foreground">
                  <RelativeTime date={stats.lastFailure.updatedAt} /> &middot;{" "}
                  <Link href={`/messages/${stats.lastFailure.messageId}`} className="hover:text-foreground hover:underline">
                    view message
                  </Link>
                </span>
              </p>
              {stats.lastFailure.lastError && <ExpandableError error={stats.lastFailure.lastError} />}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Webhooks</CardTitle>
          <CardDescription>Webhooks that send notifications to this channel.</CardDescription>
        </CardHeader>
        <CardContent>
          {channel.webhooks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Not linked to any webhook yet. Open a webhook and add this channel under Output Channels.
            </p>
          ) : (
            <div className="space-y-2">
              {channel.webhooks.map(({ webhook, enabled, filter }) => (
                <Link
                  key={webhook.id}
                  href={`/webhooks/${webhook.id}`}
                  className="flex items-center gap-3 rounded-md border px-3 py-2 transition-colors hover:bg-muted/50"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{webhook.name}</span>
                  {filter ? (
                    <Filter className="size-3.5 shrink-0 text-muted-foreground" aria-label="Filtered" />
                  ) : null}
                  {!webhook.enabled ? (
                    <Badge variant="secondary">Webhook disabled</Badge>
                  ) : !enabled ? (
                    <Badge variant="secondary">Muted</Badge>
                  ) : null}
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
