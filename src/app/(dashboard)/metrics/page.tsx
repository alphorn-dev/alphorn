import { getMetrics } from "./actions";
import { MetricsTabs } from "./metrics-tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Mail, Percent, CheckCircle2, XCircle, Timer, RotateCw, Layers } from "lucide-react";

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default async function MetricsPage() {
  const metrics = await getMetrics(30);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Metrics</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Notification activity over the last 30 days.
      </p>

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
              {metrics.avgLatencyMs !== null ? formatLatency(metrics.avgLatencyMs) : "—"}
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
              {metrics.avgRetries !== null ? metrics.avgRetries : "—"}
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
