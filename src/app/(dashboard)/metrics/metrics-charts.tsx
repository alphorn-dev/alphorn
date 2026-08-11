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
import { formatChartDate } from "@/lib/format-date";

const messageChartConfig = {
  count: {
    label: "Messages",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const deliveryChartConfig = {
  delivered: {
    label: "Delivered",
    color: "var(--success)",
  },
  failed: {
    label: "Failed",
    color: "var(--destructive)",
  },
} satisfies ChartConfig;

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
          tickFormatter={formatChartDate}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
        <ChartTooltip
          content={<ChartTooltipContent labelFormatter={formatChartDate} />}
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
          tickFormatter={formatChartDate}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
        <ChartTooltip
          content={<ChartTooltipContent labelFormatter={formatChartDate} />}
        />
        <Bar
          dataKey="delivered"
          fill="var(--success)"
          radius={[4, 4, 0, 0]}
          stackId="deliveries"
        />
        <Bar
          dataKey="failed"
          fill="var(--destructive)"
          radius={[4, 4, 0, 0]}
          stackId="deliveries"
        />
      </BarChart>
    </ChartContainer>
  );
}
