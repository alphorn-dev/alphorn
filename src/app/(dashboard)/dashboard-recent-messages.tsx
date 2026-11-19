"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useTransition } from "react";
import Link from "next/link";
import { DataTable, dataTableColumns } from "@/components/data-table";
import { DeliveryBadges } from "@/components/delivery-badges";
import { RelativeTime } from "@/components/relative-time";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

interface RecentMessage {
  id: string;
  title: string | null;
  createdAt: Date;
  webhook: { id: string; name: string; deletedAt: Date | null };
  deliveries: {
    id: string;
    status: string;
    channel: { id: string; name: string; type: string };
  }[];
}

const col = dataTableColumns<RecentMessage>();
const columns = [
  col.accessor("title", {
    header: "Title",
    size: 280,
    enableHiding: false,
    cell: ({ row }) => (
      <Link href={`/messages/${row.original.id}`} className="font-medium hover:underline">
        {row.original.title ?? <span className="pr-0.5 text-muted-foreground italic">Untitled</span>}
      </Link>
    ),
  }),
  col.accessor((m) => m.webhook.name, {
    id: "webhook",
    header: "Webhook",
    size: 180,
    enableHiding: false,
    cell: ({ row }) => {
      const wh = row.original.webhook;
      return wh.deletedAt ? (
        <span className="text-muted-foreground">{wh.name}</span>
      ) : (
        <Link href={`/webhooks/${wh.id}`} className="text-muted-foreground hover:text-foreground hover:underline">
          {wh.name}
        </Link>
      );
    },
  }),
  col.accessor("deliveries", {
    header: "Deliveries",
    size: 200,
    enableHiding: false,
    cell: ({ getValue }) => <DeliveryBadges deliveries={getValue()} />,
  }),
  col.accessor("createdAt", {
    header: "Time",
    size: 140,
    enableHiding: false,
    cell: ({ getValue }) => (
      <span className="text-muted-foreground">
        <RelativeTime date={getValue()} />
      </span>
    ),
  }),
];

/** Recent messages card body; also used on a webhook's page (`hideWebhook`). */
export function DashboardRecentMessages({
  messages,
  hideWebhook = false,
  showAllHref = "/messages",
  emptyText = "No messages yet. Create a webhook and send your first notification.",
}: {
  messages: RecentMessage[];
  hideWebhook?: boolean;
  showAllHref?: string;
  emptyText?: string;
}) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();

  // Keep the card live while deliveries are still in flight.
  const hasInFlight = messages.some((m) =>
    m.deliveries.some((d) => d.status === "PENDING" || d.status === "PROCESSING"),
  );
  useEffect(() => {
    if (!hasInFlight) return;
    const interval = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(interval);
  }, [hasInFlight, router]);

  const visibleColumns = useMemo(
    () => (hideWebhook ? columns.filter((c) => c.id !== "webhook") : columns),
    [hideWebhook],
  );

  if (messages.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div>
      <DataTable
        storageKey={hideWebhook ? "webhook-recent" : "dashboard-recent"}
        columns={visibleColumns}
        data={messages}
        getRowId={(m) => m.id}
        rowHref={(m) => `/messages/${m.id}`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => startTransition(() => router.refresh())}
            disabled={refreshing}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />
      <div className="mt-4 text-center">
        <Link
          href={showAllHref}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Show all messages &rarr;
        </Link>
      </div>
    </div>
  );
}
