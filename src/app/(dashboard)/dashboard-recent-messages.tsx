"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw } from "lucide-react";

interface RecentMessage {
  id: string;
  title: string | null;
  createdAt: Date;
  webhook: { name: string };
  deliveries: {
    id: string;
    status: string;
    channel: { id: string; name: string; type: string };
  }[];
}

export function DashboardRecentMessages({
  messages,
}: {
  messages: RecentMessage[];
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  function refresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 500);
  }

  if (messages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No messages yet. Create a webhook and send your first notification.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={refreshing}
          className="gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Webhook</TableHead>
            <TableHead>Deliveries</TableHead>
            <TableHead>Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {messages.map((msg) => (
            <TableRow key={msg.id}>
              <TableCell>
                <Link
                  href={`/messages/${msg.id}`}
                  className="font-medium hover:underline"
                >
                  {msg.title ?? <span className="text-muted-foreground italic">Untitled</span>}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {msg.webhook.name}
              </TableCell>
              <TableCell>
                <div className="flex gap-1 flex-wrap">
                  {msg.deliveries.map((d) => (
                    <Link key={d.id} href={`/channels/${d.channel.id}/edit`} title={d.channel.name}>
                      <StatusBadge status={d.status} />
                    </Link>
                  ))}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {new Date(msg.createdAt).toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="mt-4 text-center">
        <Link
          href="/messages"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Show all messages &rarr;
        </Link>
      </div>
    </div>
  );
}
