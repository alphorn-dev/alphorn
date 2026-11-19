"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { DeliveryBadges } from "@/components/delivery-badges";
import { DataTable, dataTableColumns } from "@/components/data-table";
import { RelativeTime } from "@/components/relative-time";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  X,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  CalendarDays,
  ListFilter,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { PRIORITY_OPTIONS } from "@/lib/filter/schema";
import { PriorityBadge } from "@/components/priority-badge";
import type { MessageFilters } from "./actions";
import { PAGE_SIZES } from "./query";

interface Message {
  id: string;
  title: string | null;
  message: string;
  priority: number | null;
  tags: string[];
  createdAt: Date;
  webhook: { id: string; name: string; deletedAt: Date | null };
  deliveries: {
    id: string;
    status: string;
    channel: { id: string; name: string; type: string };
  }[];
}

const DELIVERY_STATUSES: Record<string, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  DELIVERED: "Delivered",
  FAILED: "Failed",
  STALE: "Stale",
};

interface Webhook {
  id: string;
  name: string;
}

function parseMulti(value: string | undefined): string[] {
  return value ? value.split(",") : [];
}

function toMulti(values: string[]): string | undefined {
  return values.length > 0 ? values.join(",") : undefined;
}

function MultiFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const count = selected.length;

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-40 justify-between gap-1 font-normal"
          >
            <span className="truncate">
              {count === 0
                ? label
                : count === 1
                  ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
                  : `${count} selected`}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-48 p-1">
        {options.map((opt) => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
          >
            <Checkbox
              checked={selected.includes(opt.value)}
              onCheckedChange={() => toggle(opt.value)}
            />
            {opt.label}
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const selected = value ? new Date(value + "T00:00:00") : undefined;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-40 justify-between gap-1 font-normal"
          >
            <span className={!value ? "text-muted-foreground" : ""}>
              {value ? formatDateLabel(value) : label}
            </span>
            <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(day) => {
            if (day) {
              const iso = [
                day.getFullYear(),
                String(day.getMonth() + 1).padStart(2, "0"),
                String(day.getDate()).padStart(2, "0"),
              ].join("-");
              onChange(iso);
            } else {
              onChange(undefined);
            }
          }}
        />
        {value && (
          <div className="border-t px-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => onChange(undefined)}
            >
              <X data-icon="inline-start" />
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

const col = dataTableColumns<Message>();

function parseSort(sort: string | undefined) {
  const [id, dir] = (sort ?? "createdAt.desc").split(".");
  return [{ id, desc: dir !== "asc" }];
}

export function MessagesTable({
  messages,
  total,
  page,
  pageSize,
  allTags,
  webhooks,
  channels,
  filters,
}: {
  messages: Message[];
  total: number;
  page: number;
  pageSize: number;
  allTags: string[];
  webhooks: Webhook[];
  channels: { id: string; name: string }[];
  filters: MessageFilters;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [localQ, setLocalQ] = useState<{ key: string; value: string }>({
    key: filters.q ?? "",
    value: filters.q ?? "",
  });
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Sync local search value when filters.q changes externally
  const searchValue =
    localQ.key === (filters.q ?? "") ? localQ.value : (filters.q ?? "");
  const setSearchValue = (v: string) =>
    setLocalQ({ key: filters.q ?? "", value: v });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const navigate = useCallback(
    (updates: Partial<MessageFilters>) => {
      const params = new URLSearchParams();

      const merged = { ...filters, ...updates };

      if (!("page" in updates)) {
        delete merged.page;
      }

      for (const [key, value] of Object.entries(merged)) {
        if (value && value !== "1") {
          params.set(key, value);
        }
      }

      const qs = params.toString();
      startTransition(() => {
        router.push(qs ? `${pathname}?${qs}` : pathname);
      });
    },
    [filters, pathname, router],
  );

  // Keep the page live while deliveries on it are still in flight.
  const hasInFlight = messages.some((m) =>
    m.deliveries.some((d) => d.status === "PENDING" || d.status === "PROCESSING"),
  );
  useEffect(() => {
    if (!hasInFlight) return;
    const interval = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(interval);
  }, [hasInFlight, router]);

  function clearAllFilters() {
    // Filters only: sorting and page size are view preferences.
    navigate({ q: undefined, tag: undefined, status: undefined, priority: undefined, webhook: undefined, channel: undefined, from: undefined, to: undefined });
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      navigate({ q: e.currentTarget.value || undefined });
    }
  }

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      navigate({ q: value || undefined });
    }, 400);
  }

  const hasActiveFilters =
    filters.q || filters.tag || filters.status || filters.priority || filters.webhook || filters.channel || filters.from || filters.to;

  const selectedTags = parseMulti(filters.tag);
  const selectedWebhooks = parseMulti(filters.webhook);
  const selectedChannels = parseMulti(filters.channel);
  const selectedStatuses = parseMulti(filters.status);
  const selectedPriorities = parseMulti(filters.priority);

  const columns = useMemo(() => [
    col.accessor("title", {
      header: "Title",
      size: 320,
      enableSorting: true,
      enableHiding: false,
      cell: ({ row }) => {
        const msg = row.original;
        return (
          <>
            <div className="flex min-w-0 items-center gap-2">
              <Link href={`/messages/${msg.id}`} className="truncate font-medium hover:underline">
                {msg.title ?? <span className="pr-0.5 text-muted-foreground italic">Untitled</span>}
              </Link>
              {msg.priority != null && <PriorityBadge priority={msg.priority} />}
            </div>
            {msg.message && (
              <p className="truncate text-xs text-muted-foreground">{msg.message}</p>
            )}
          </>
        );
      },
    }),
    col.accessor("tags", {
      header: "Tags",
      size: 160,
      cell: ({ getValue }) => (
        <div className="flex flex-wrap gap-1">
          {getValue().map((tag) => (
            <button key={tag} type="button" onClick={() => navigate({ tag })} title={`Filter by ${tag}`}>
              <Badge variant="outline" className="cursor-pointer text-xs hover:bg-muted">
                {tag}
              </Badge>
            </button>
          ))}
        </div>
      ),
    }),
    col.accessor((m) => m.webhook.name, {
      id: "webhook",
      header: "Webhook",
      size: 180,
      enableSorting: true,
      cell: ({ row }) => {
        const wh = row.original.webhook;
        return (
          <div className="group/wh flex min-w-0 items-center gap-1 text-muted-foreground">
            {wh.deletedAt ? (
              <span className="truncate" title="Deleted webhook">{wh.name}</span>
            ) : (
              <Link href={`/webhooks/${wh.id}`} className="truncate hover:text-foreground hover:underline">
                {wh.name}
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Show only messages from ${wh.name}`}
              title="Filter by this webhook"
              onClick={() => navigate({ webhook: wh.id })}
              className="shrink-0 opacity-0 group-hover/wh:opacity-100 focus-visible:opacity-100"
            >
              <ListFilter />
            </Button>
          </div>
        );
      },
    }),
    col.accessor("deliveries", {
      header: "Deliveries",
      size: 200,
      cell: ({ getValue }) =>
        getValue().length === 0 ? (
          <Badge className="border-success/20 bg-success-muted text-success hover:bg-success-muted">
            Received
          </Badge>
        ) : (
          <DeliveryBadges deliveries={getValue()} />
        ),
    }),
    col.accessor("createdAt", {
      header: "Received",
      size: 150,
      enableSorting: true,
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">
          <RelativeTime date={getValue()} />
        </span>
      ),
    }),
  ], [navigate]);

  return (
    <div className="mt-6">
      {/* Search bar */}
      <div className="mb-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search titles and message text..."
            aria-label="Search titles and message text"
            value={searchValue}
            onChange={(e) => {
              setSearchValue(e.target.value);
              handleSearchChange(e);
            }}
            onKeyDown={handleSearchKeyDown}
            className="pl-8"
          />
        </div>
      </div>

      <DataTable
        storageKey="messages"
        columns={columns}
        data={messages}
        getRowId={(m) => m.id}
        rowHref={(m) => `/messages/${m.id}`}
        sorting={parseSort(filters.sort)}
        onSortingChange={(next) =>
          navigate({ sort: next[0] ? `${next[0].id}.${next[0].desc ? "desc" : "asc"}` : undefined })
        }
        toolbar={
          <>
            {allTags.length > 0 && (
              <MultiFilter
                label="All tags"
                options={allTags.map((t) => ({ value: t, label: t }))}
                selected={selectedTags}
                onChange={(v) => navigate({ tag: toMulti(v) })}
              />
            )}

            {webhooks.length > 0 && (
              <MultiFilter
                label="All webhooks"
                options={webhooks.map((w) => ({ value: w.id, label: w.name }))}
                selected={selectedWebhooks}
                onChange={(v) => navigate({ webhook: toMulti(v) })}
              />
            )}

            {channels.length > 0 && (
              <MultiFilter
                label="All channels"
                options={channels.map((c) => ({ value: c.id, label: c.name }))}
                selected={selectedChannels}
                onChange={(v) => navigate({ channel: toMulti(v) })}
              />
            )}

            <MultiFilter
              label="All statuses"
              options={Object.entries(DELIVERY_STATUSES).map(([key, label]) => ({
                value: key,
                label,
              }))}
              selected={selectedStatuses}
              onChange={(v) => navigate({ status: toMulti(v) })}
            />

            <MultiFilter
              label="All priorities"
              options={PRIORITY_OPTIONS.map(({ value, label }) => ({
                value: String(value),
                label,
              }))}
              selected={selectedPriorities}
              onChange={(v) => navigate({ priority: toMulti(v) })}
            />

            <DateFilter
              label="Start date"
              value={filters.from}
              onChange={(v) => navigate({ from: v })}
            />
            <DateFilter
              label="End date"
              value={filters.to}
              onChange={(v) => navigate({ to: v })}
            />

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="gap-1 text-muted-foreground"
              >
                <X data-icon="inline-start" />
                Clear filters
              </Button>
            )}
          </>
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              startTransition(() => router.refresh());
            }}
            disabled={isPending}
            className="gap-1.5"
          >
            <RefreshCw
              data-icon="inline-start"
              className={isPending ? "animate-spin" : ""}
            />
            Refresh
          </Button>
        }
        empty={
          <div className="mt-8 text-center">
            <p className="text-muted-foreground">
              {hasActiveFilters
                ? "No messages match your filters."
                : "No messages yet."}
            </p>
          </div>
        }
      />

      {messages.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {total} message{total !== 1 ? "s" : ""}
            {totalPages > 1 && (
              <> &middot; page {page} of {totalPages}</>
            )}
          </p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Rows per page</span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => v && navigate({ size: v === String(PAGE_SIZES[0]) ? undefined : v })}
              >
                <SelectTrigger size="sm" className="w-18" aria-label="Rows per page">
                  <SelectValue>{pageSize}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="First page"
                  disabled={page <= 1 || isPending}
                  onClick={() => navigate({ page: "1" })}
                >
                  <ChevronsLeft data-icon />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Previous page"
                  disabled={page <= 1 || isPending}
                  onClick={() => navigate({ page: String(page - 1) })}
                >
                  <ChevronLeft data-icon />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Next page"
                  disabled={page >= totalPages || isPending}
                  onClick={() => navigate({ page: String(page + 1) })}
                >
                  <ChevronRight data-icon />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Last page"
                  disabled={page >= totalPages || isPending}
                  onClick={() => navigate({ page: String(totalPages) })}
                >
                  <ChevronsRight data-icon />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
