"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getMessageDeliveries, resendDelivery } from "../actions";
import { StatusBadge } from "@/components/status-badge";
import { ExpandableError } from "@/components/expandable-error";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RotateCcw, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";

interface Delivery {
  id: string;
  channelId: string;
  status: string;
  attempts: number;
  lastError: string | null;
  channel: { id: string; name: string; type: string };
}

export function DeliveriesTable({
  messageId,
  initialDeliveries,
}: {
  messageId: string;
  initialDeliveries: Delivery[];
}) {
  const [deliveries, setDeliveries] = useState<Delivery[]>(initialDeliveries);
  const [resending, setResending] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);

  const hasPending = deliveries.some(
    (d) => d.status === "PENDING" || d.status === "PROCESSING"
  );

  const loadDeliveries = useCallback(async () => {
    const data = await getMessageDeliveries(messageId);
    if (data) setDeliveries(data as Delivery[]);
  }, [messageId]);

  // Auto-poll when there are pending/processing deliveries
  useEffect(() => {
    if (!hasPending) return;
    const interval = setInterval(loadDeliveries, 2000);
    return () => clearInterval(interval);
  }, [hasPending, loadDeliveries]);

  async function handleResend(deliveryId: string) {
    setResending((prev) => ({ ...prev, [deliveryId]: true }));
    try {
      await resendDelivery(deliveryId);
      toast.success("Delivery queued");
      await loadDeliveries();
    } catch (err) {
      showError(err, "Resend failed");
    } finally {
      setResending((prev) => ({ ...prev, [deliveryId]: false }));
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadDeliveries();
    setRefreshing(false);
  }

  if (deliveries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No deliveries — this message was received but didn&apos;t match any channel filters.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
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
          <TableHead>Channel</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Attempts</TableHead>
          <TableHead>Error</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {deliveries.map((d) => (
          <TableRow key={d.id}>
            <TableCell className="font-medium">
              <Link
                href={`/channels/${d.channel.id}/edit`}
                className="hover:underline"
              >
                {d.channel.name}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {d.channel.type}
            </TableCell>
            <TableCell>
              <StatusBadge status={d.status} />
            </TableCell>
            <TableCell>{d.attempts}</TableCell>
            <TableCell className="max-w-xs">
              {d.lastError && <ExpandableError error={d.lastError} />}
            </TableCell>
            <TableCell className="text-right">
              {d.status === "PENDING" || d.status === "PROCESSING" ? (
                <Button size="sm" variant="outline" disabled className="gap-1">
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                  Processing
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={resending[d.id]}
                  onClick={() => handleResend(d.id)}
                  className="gap-1"
                >
                  <RotateCcw data-icon="inline-start" />
                  {resending[d.id] ? "Queuing..." : "Resend"}
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  );
}
