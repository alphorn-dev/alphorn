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
import type { DailyMessageCount, DailyDeliveryStats } from "./actions";

const messageChartConfig = {
  count: {
    label: "Messages",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const deliveryChartConfig = {
  delivered: {
    label: "Delivered",
    color: "oklch(0.65 0.17 155)",
  },
  failed: {
    label: "Failed",
    color: "oklch(0.65 0.2 25)",
  },
} satisfies ChartConfig;

function formatDate(label: unknown) {
  const dateStr = String(label);
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function MessageVolumeChart({
  data,
}: {
  data: DailyMessageCount[];
}) {
  return (
    <ChartContainer config={messageChartConfig} className="h-[300px] w-full">
      <AreaChart data={data} accessibilityLayer>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
        <ChartTooltip
          content={<ChartTooltipContent labelFormatter={formatDate} />}
        />
        <Area
          dataKey="count"
          type="monotone"
          fill="var(--chart-1)"
          fillOpacity={0.15}
          stroke="var(--chart-1)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}

export function DeliveryStatusChart({
  data,
}: {
  data: DailyDeliveryStats[];
}) {
  return (
    <ChartContainer config={deliveryChartConfig} className="h-[300px] w-full">
      <BarChart data={data} accessibilityLayer>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
        <ChartTooltip
          content={<ChartTooltipContent labelFormatter={formatDate} />}
        />
        <Bar
          dataKey="delivered"
          fill="oklch(0.65 0.17 155)"
          radius={[4, 4, 0, 0]}
          stackId="deliveries"
        />
        <Bar
          dataKey="failed"
          fill="oklch(0.65 0.2 25)"
          radius={[4, 4, 0, 0]}
          stackId="deliveries"
        />
      </BarChart>
    </ChartContainer>
  );
}
