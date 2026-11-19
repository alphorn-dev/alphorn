"use client";

import { useMemo } from "react";
import Link from "next/link";
import { DataTable, dataTableColumns } from "@/components/data-table";
import { ChannelIcon } from "@/components/channel-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SquarePen } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import { getChannelMeta } from "@/channels/meta";

export interface ChannelRow {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  createdAt: Date;
  webhooks: { webhook: { id: string; name: string } }[];
}

const col = dataTableColumns<ChannelRow>();

export function ChannelsTable({
  channels,
  isAdminOrOwner,
}: {
  channels: ChannelRow[];
  isAdminOrOwner: boolean;
}) {
  const columns = useMemo(() => [
    col.accessor("name", {
      header: "Name",
      size: 220,
      enableSorting: true,
      enableHiding: false,
      cell: ({ row }) => (
        <Link href={`/channels/${row.original.id}`} className="font-medium hover:underline">
          {row.original.name}
        </Link>
      ),
    }),
    col.accessor((c) => getChannelMeta(c.type)?.displayName ?? c.type, {
      id: "type",
      header: "Type",
      size: 160,
      enableSorting: true,
      cell: ({ row, getValue }) => (
        <span className="flex items-center gap-2">
          <ChannelIcon icon={row.original.type} className="size-4 shrink-0" />
          {getValue()}
        </span>
      ),
    }),
    col.accessor("webhooks", {
      header: "Webhooks",
      size: 240,
      cell: ({ getValue }) =>
        getValue().length === 0 ? (
          <span className="text-muted-foreground">None</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {getValue().map(({ webhook }) => (
              <Link key={webhook.id} href={`/webhooks/${webhook.id}`}>
                <Badge variant="secondary" className="hover:bg-accent">
                  {webhook.name}
                </Badge>
              </Link>
            ))}
          </div>
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
              <Link href={`/channels/${row.original.id}/edit`}>
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
                  <SquarePen className="h-4 w-4" />
                  <span className="sr-only">Edit</span>
                </Button>
              </Link>
            ),
          }),
        ]
      : []),
  ], [isAdminOrOwner]);

  return (
    <DataTable
      storageKey="channels"
      columns={columns}
      data={channels}
      getRowId={(c) => c.id}
      rowHref={(c) => `/channels/${c.id}`}
    />
  );
}
