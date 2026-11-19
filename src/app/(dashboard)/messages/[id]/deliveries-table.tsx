"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { getMessageDeliveries, resendDelivery, resendFailedDeliveries } from "../actions";
import { StatusBadge } from "@/components/status-badge";
import { ExpandableError } from "@/components/expandable-error";
import { ChannelIcon } from "@/components/channel-icons";
import { DataTable, dataTableColumns } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { RotateCcw, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import { getChannelMeta } from "@/channels/meta";

interface Delivery {
  id: string;
  channelId: string;
  status: string;
  attempts: number;
  lastError: string | null;
  channel: { id: string; name: string; type: string };
}

const col = dataTableColumns<Delivery>();

function isInFlight(status: string) {
  return status === "PENDING" || status === "PROCESSING";
}

export function DeliveriesTable({
  messageId,
  initialDeliveries,
  isAdminOrOwner,
  canResend,
}: {
  messageId: string;
  initialDeliveries: Delivery[];
  isAdminOrOwner: boolean;
  canResend: boolean;
}) {
  const [deliveries, setDeliveries] = useState<Delivery[]>(initialDeliveries);
  const [resending, setResending] = useState<Record<string, boolean>>({});
  const [resendingAll, setResendingAll] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const hasPending = deliveries.some((d) => isInFlight(d.status));
  const failedCount = deliveries.filter((d) => d.status === "FAILED" || d.status === "STALE").length;

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

  const handleResend = useCallback(async (deliveryId: string) => {
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
  }, [loadDeliveries]);

  async function handleResendAll() {
    setResendingAll(true);
    try {
      const count = await resendFailedDeliveries(messageId);
      toast.success(`${count} deliver${count === 1 ? "y" : "ies"} queued`);
      await loadDeliveries();
    } catch (err) {
      showError(err, "Resend failed");
    } finally {
      setResendingAll(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadDeliveries();
    setRefreshing(false);
  }

  const columns = useMemo(() => [
    col.accessor((d) => d.channel.name, {
      id: "channel",
      header: "Channel",
      size: 180,
      enableSorting: true,
      enableHiding: false,
      cell: ({ row }) => (
        <Link href={`/channels/${row.original.channel.id}`} className="font-medium hover:underline">
          {row.original.channel.name}
        </Link>
      ),
    }),
    col.accessor((d) => getChannelMeta(d.channel.type)?.displayName ?? d.channel.type, {
      id: "type",
      header: "Type",
      size: 150,
      enableSorting: true,
      cell: ({ row, getValue }) => (
        <span className="flex items-center gap-2 text-muted-foreground">
          <ChannelIcon icon={row.original.channel.type} className="size-4 shrink-0" />
          {getValue()}
        </span>
      ),
    }),
    col.accessor("status", {
      header: "Status",
      size: 110,
      enableSorting: true,
      cell: ({ getValue }) => <StatusBadge status={getValue()} />,
    }),
    col.accessor("attempts", {
      header: "Attempts",
      size: 90,
      enableSorting: true,
      cell: ({ getValue }) => <span className="tabular-nums">{getValue()}</span>,
    }),
    col.accessor("lastError", {
      header: "Error",
      size: 260,
      meta: { className: "whitespace-normal" },
      cell: ({ getValue }) => {
        const error = getValue();
        return error ? <ExpandableError error={error} /> : null;
      },
    }),
    col.display({
      id: "actions",
      size: 130,
      enableHiding: false,
      enableResizing: false,
      meta: { className: "text-right" },
      cell: ({ row }) => {
        const d = row.original;
        return isInFlight(d.status) ? (
          <Button size="sm" variant="outline" disabled className="gap-1">
            <Loader2 data-icon="inline-start" className="animate-spin" />
            Processing
          </Button>
        ) : isAdminOrOwner && canResend ? (
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
        ) : null;
      },
    }),
  ], [handleResend, resending, isAdminOrOwner, canResend]);

  if (deliveries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No deliveries - this message was received but didn&apos;t match any channel filters.
      </p>
    );
  }

  return (
    <DataTable
      storageKey="deliveries"
      columns={columns}
      data={deliveries}
      getRowId={(d) => d.id}
      actions={
        <>
          {isAdminOrOwner && canResend && failedCount > 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResendAll}
              disabled={resendingAll}
              className="gap-1.5"
            >
              <RotateCcw data-icon="inline-start" />
              {resendingAll ? "Queuing..." : `Retry ${failedCount} failed`}
            </Button>
          )}
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
        </>
      }
    />
  );
}
