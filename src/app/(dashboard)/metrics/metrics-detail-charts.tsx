"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { DailyLatency, ChannelStats, WebhookStats } from "./actions";
import { formatShortDate } from "@/lib/format-date";

function formatDate(label: unknown) {
  return formatShortDate(`${String(label)}T00:00:00`);
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const latencyChartConfig = {
  avgMs: {
    label: "Avg Latency",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

export function LatencyChart({ data }: { data: DailyLatency[] }) {
  if (data.length === 0) {
    return (
      <p className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
        No delivery latency data yet.
      </p>
    );
  }

  return (
    <ChartContainer config={latencyChartConfig} className="h-[300px] w-full">
      <AreaChart data={data} accessibilityLayer>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(v) => formatLatency(v as number)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={formatDate}
              formatter={(value) => formatLatency(value as number)}
            />
          }
        />
        <Area
          dataKey="avgMs"
          type="monotone"
          fill="var(--chart-3)"
          fillOpacity={0.15}
          stroke="var(--chart-3)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}

const channelChartConfig = {
  delivered: {
    label: "Delivered",
    color: "oklch(0.65 0.17 155)",
  },
  failed: {
    label: "Failed",
    color: "oklch(0.65 0.2 25)",
  },
} satisfies ChartConfig;

export function TopChannelsChart({ data }: { data: ChannelStats[] }) {
  if (data.length === 0) {
    return (
      <p className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
        No channel data yet.
      </p>
    );
  }

  return (
    <ChartContainer config={channelChartConfig} className="h-[300px] w-full">
      <BarChart data={data} layout="vertical" accessibilityLayer>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="channelName"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={120}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar
          dataKey="delivered"
          fill="oklch(0.65 0.17 155)"
          radius={[0, 4, 4, 0]}
          stackId="channel"
        />
        <Bar
          dataKey="failed"
          fill="oklch(0.65 0.2 25)"
          radius={[0, 4, 4, 0]}
          stackId="channel"
        />
      </BarChart>
    </ChartContainer>
  );
}

const webhookChartConfig = {
  messageCount: {
    label: "Messages",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

export function TopWebhooksChart({ data }: { data: WebhookStats[] }) {
  if (data.length === 0) {
    return (
      <p className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
        No webhook data yet.
      </p>
    );
  }

  return (
    <ChartContainer config={webhookChartConfig} className="h-[300px] w-full">
      <BarChart data={data} layout="vertical" accessibilityLayer>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="webhookName"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={120}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar
          dataKey="messageCount"
          fill="var(--chart-2)"
          radius={[0, 4, 4, 0]}
        />
      </BarChart>
    </ChartContainer>
  );
}
