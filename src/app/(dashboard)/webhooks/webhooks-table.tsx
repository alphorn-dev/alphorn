"use client";

import { useMemo } from "react";
import Link from "next/link";
import { DataTable, dataTableColumns } from "@/components/data-table";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SquarePen } from "lucide-react";
import { formatDate } from "@/lib/format-date";

export interface WebhookRow {
  id: string;
  name: string;
  enabled: boolean;
  createdAt: Date;
  publicId: string;
  isGithub: boolean;
  channels: { channelId: string; channel: { name: string } }[];
  _count: { messages: number };
}

const col = dataTableColumns<WebhookRow>();

export function WebhooksTable({
  webhooks,
  endpointBase,
  isAdminOrOwner,
}: {
  webhooks: WebhookRow[];
  endpointBase: string;
  isAdminOrOwner: boolean;
}) {
  const columns = useMemo(() => [
    col.accessor("name", {
      header: "Name",
      size: 220,
      enableSorting: true,
      enableHiding: false,
      cell: ({ row }) => (
        <Link href={`/webhooks/${row.original.id}`} className="font-medium hover:underline">
          {row.original.name}
        </Link>
      ),
    }),
    col.accessor("publicId", {
      header: "Endpoint",
      size: 120,
      cell: ({ row }) =>
        // GitHub-connected webhooks receive events via the GitHub App, not /n/.
        row.original.isGithub ? (
          <span className="text-xs text-muted-foreground">GitHub App</span>
        ) : (
          <CopyButton
            value={`${endpointBase}/n/${row.original.publicId}`}
            label="Copy endpoint URL"
            toastMessage="Endpoint URL copied"
            variant="ghost"
            size="sm"
            className="-ml-2 text-muted-foreground"
          >
            Copy URL
          </CopyButton>
        ),
    }),
    col.accessor("channels", {
      header: "Channels",
      size: 240,
      cell: ({ getValue }) =>
        getValue().length === 0 ? (
          <span className="text-muted-foreground">None</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {getValue().map((wc) => (
              <Link key={wc.channelId} href={`/channels/${wc.channelId}`}>
                <Badge variant="secondary" className="hover:bg-accent">
                  {wc.channel.name}
                </Badge>
              </Link>
            ))}
          </div>
        ),
    }),
    col.accessor((w) => w._count.messages, {
      id: "messages",
      header: "Messages",
      size: 110,
      enableSorting: true,
      cell: ({ row, getValue }) => (
        <Link
          href={`/messages?webhook=${row.original.id}`}
          className="tabular-nums hover:underline"
          title="View messages from this webhook"
        >
          {getValue()}
        </Link>
      ),
    }),
    col.accessor("enabled", {
      header: "Status",
      size: 100,
      enableSorting: true,
      cell: ({ getValue }) =>
        getValue() ? (
          <Badge className="border-success/20 bg-success-muted text-success hover:bg-success-muted">
            Active
          </Badge>
        ) : (
          <Badge variant="secondary">Disabled</Badge>
        ),
    }),
    col.accessor("createdAt", {
      header: "Created",
      size: 130,
      enableSorting: true,
      cell: ({ getValue }) => formatDate(getValue()),
    }),
    ...(isAdminOrOwner
      ? [
          col.display({
            id: "actions",
            size: 56,
            enableHiding: false,
            enableResizing: false,
            cell: ({ row }) => (
              <Link href={`/webhooks/${row.original.id}/edit`}>
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
                  <SquarePen className="h-4 w-4" />
                  <span className="sr-only">Edit</span>
                </Button>
              </Link>
            ),
          }),
        ]
      : []),
  ], [endpointBase, isAdminOrOwner]);

  return (
    <DataTable
      storageKey="webhooks"
      columns={columns}
      data={webhooks}
      getRowId={(w) => w.id}
      rowHref={(w) => `/webhooks/${w.id}`}
    />
  );
}
