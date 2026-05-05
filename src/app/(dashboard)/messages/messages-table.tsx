"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  ChevronDown,
  CalendarDays,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import type { MessageFilters } from "./actions";

interface Message {
  id: string;
  title: string | null;
  message: string;
  priority: number | null;
  tags: string[];
  createdAt: Date;
  webhook: { name: string };
  deliveries: {
    id: string;
    status: string;
    channel: { id: string; name: string; type: string };
  }[];
}

const PRIORITY_LABELS: Record<
  number,
  { label: string; variant: "secondary" | "default" | "outline" | "destructive" }
> = {
  1: { label: "min", variant: "secondary" },
  2: { label: "low", variant: "secondary" },
  3: { label: "default", variant: "outline" },
  4: { label: "high", variant: "default" },
  5: { label: "urgent", variant: "destructive" },
};

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

export function MessagesTable({
  messages,
  total,
  page,
  pageSize,
  allTags,
  webhooks,
  filters,
}: {
  messages: Message[];
  total: number;
  page: number;
  pageSize: number;
  allTags: string[];
  webhooks: Webhook[];
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

  function clearAllFilters() {
    startTransition(() => {
      router.push(pathname);
    });
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
    filters.q || filters.tag || filters.status || filters.priority || filters.webhook || filters.from || filters.to;

  const selectedTags = parseMulti(filters.tag);
  const selectedWebhooks = parseMulti(filters.webhook);
  const selectedStatuses = parseMulti(filters.status);
  const selectedPriorities = parseMulti(filters.priority);

  return (
    <div className="mt-6">
      {/* Search bar */}
      <div className="mb-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search messages..."
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

      {/* Filters row */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
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
          options={Object.entries(PRIORITY_LABELS).map(([key, { label }]) => ({
            value: key,
            label: label.charAt(0).toUpperCase() + label.slice(1),
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

        <div className="ml-auto">
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
        </div>
      </div>

      {/* Table */}
      {messages.length === 0 ? (
        <div className="mt-8 text-center">
          <p className="text-muted-foreground">
            {hasActiveFilters
              ? "No messages match your filters."
              : "No messages yet."}
          </p>
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Webhook</TableHead>
                <TableHead>Deliveries</TableHead>
                <TableHead>Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {messages.map((msg) => {
                const prio =
                  msg.priority != null ? PRIORITY_LABELS[msg.priority] : null;
                return (
                  <TableRow key={msg.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/messages/${msg.id}`}
                          className="font-medium hover:underline"
                        >
                          {msg.title ?? <span className="text-muted-foreground italic">Untitled</span>}
                        </Link>
                        {prio && (
                          <Badge variant={prio.variant}>{prio.label}</Badge>
                        )}
                      </div>
                      {msg.message && (
                        <p className="text-xs text-muted-foreground truncate max-w-xs">
                          {msg.message}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {msg.tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="cursor-pointer text-xs"
                            onClick={() => navigate({ tag })}
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {msg.webhook.name}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {msg.deliveries.length === 0 ? (
                          <Badge className="border-success/20 bg-success-muted text-success hover:bg-success-muted">
                            Received
                          </Badge>
                        ) : (
                          msg.deliveries.map((d) => (
                            <Link
                              key={d.id}
                              href={`/channels/${d.channel.id}/edit`}
                              title={d.channel.name}
                            >
                              <StatusBadge status={d.status} />
                            </Link>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(msg.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {total} message{total !== 1 ? "s" : ""}
              {totalPages > 1 && (
                <> &middot; page {page} of {totalPages}</>
              )}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page <= 1 || isPending}
                  onClick={() => navigate({ page: String(page - 1) })}
                >
                  <ChevronLeft data-icon />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={page >= totalPages || isPending}
                  onClick={() => navigate({ page: String(page + 1) })}
                >
                  <ChevronRight data-icon />
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
