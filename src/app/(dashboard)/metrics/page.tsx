import Link from "next/link";
import { getMetrics } from "./actions";
import { cn } from "@/lib/utils";
import { MetricsTabs } from "./metrics-tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Mail, Percent, CheckCircle2, XCircle, Timer, RotateCw, Layers } from "lucide-react";
import { formatLatency } from "@/lib/format-date";

const PERIODS = [
  { days: 1, label: "24h", description: "the last 24 hours" },
  { days: 7, label: "7d", description: "the last 7 days" },
  { days: 30, label: "30d", description: "the last 30 days" },
  { days: 90, label: "90d", description: "the last 90 days" },
];
const DEFAULT_DAYS = 30;

export default async function MetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days } = await searchParams;
  const period = PERIODS.find((p) => String(p.days) === days) ?? PERIODS.find((p) => p.days === DEFAULT_DAYS)!;
  const metrics = await getMetrics(period.days);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Metrics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Notification activity over {period.description}.
          </p>
        </div>
        <nav aria-label="Time period" className="inline-flex rounded-lg bg-muted p-0.5">
          {PERIODS.map((p) => (
            <Link
              key={p.days}
              href={p.days === DEFAULT_DAYS ? "/metrics" : `/metrics?days=${p.days}`}
              aria-current={p === period ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                p === period && "bg-background text-foreground shadow-sm",
              )}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Total Messages</CardDescription>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{metrics.totalMessages}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Delivery Rate</CardDescription>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{metrics.deliveryRate}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Delivered</CardDescription>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-success">
              {metrics.deliveredCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Failed</CardDescription>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-destructive">
              {metrics.failedCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Avg Latency</CardDescription>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">
              {metrics.avgLatencyMs !== null ? formatLatency(metrics.avgLatencyMs) : "-"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Avg Retries</CardDescription>
            <RotateCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">
              {metrics.avgRetries !== null ? metrics.avgRetries : "-"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Queue Depth</CardDescription>
            <Layers className="h-4 w-4 text-info" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-info">
              {metrics.pendingCount}
            </p>
          </CardContent>
        </Card>
      </div>

      <MetricsTabs metrics={metrics} />
    </div>
  );
}
