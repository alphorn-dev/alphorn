"use client";

import dynamic from "next/dynamic";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TopErrorsTable } from "./top-errors-table";
import type { MetricsData } from "./actions";

const MessageVolumeChart = dynamic(() =>
  import("./metrics-charts").then((m) => m.MessageVolumeChart)
);
const DeliveryStatusChart = dynamic(() =>
  import("./metrics-charts").then((m) => m.DeliveryStatusChart)
);
const LatencyChart = dynamic(() =>
  import("./metrics-detail-charts").then((m) => m.LatencyChart)
);
const TopChannelsChart = dynamic(() =>
  import("./metrics-detail-charts").then((m) => m.TopChannelsChart)
);
const TopWebhooksChart = dynamic(() =>
  import("./metrics-detail-charts").then((m) => m.TopWebhooksChart)
);

export function MetricsTabs({ metrics }: { metrics: MetricsData }) {
  return (
    <Tabs defaultValue="volume" className="mt-6">
      <TabsList>
        <TabsTrigger value="volume">Volume</TabsTrigger>
        <TabsTrigger value="performance">Performance</TabsTrigger>
      </TabsList>

      <TabsContent value="volume" className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Message Volume</CardTitle>
              <CardDescription>
                Notifications received per day.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MessageVolumeChart data={metrics.dailyMessages} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Delivery Status</CardTitle>
              <CardDescription>
                Delivered vs failed per day.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DeliveryStatusChart data={metrics.dailyDeliveries} />
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="performance" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Delivery Latency</CardTitle>
            <CardDescription>
              Average time from message received to delivered, per day.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LatencyChart data={metrics.dailyLatency} />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Top Channels</CardTitle>
              <CardDescription>
                Most active channels by delivery volume.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TopChannelsChart data={metrics.topChannels} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Webhooks</CardTitle>
              <CardDescription>
                Most active webhooks by message count.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TopWebhooksChart data={metrics.topWebhooks} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Common Errors</CardTitle>
            <CardDescription>
              Most frequent delivery errors.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TopErrorsTable data={metrics.topErrors} />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
