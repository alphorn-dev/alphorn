import { notFound } from "next/navigation";
import Link from "next/link";
import { getMessageById } from "../actions";
import { DeliveriesTable } from "./deliveries-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

export default async function MessageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const message = await getMessageById(id);

  if (!message) {
    notFound();
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-4">
        <Link href="/messages">
          <Button variant="ghost" size="icon">
            <ArrowLeft data-icon />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{message.title ?? <span className="text-muted-foreground italic">Untitled</span>}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            via {message.webhook.name} &middot;{" "}
            {new Date(message.createdAt).toLocaleString()}
          </p>
        </div>
      </div>

      {(message.tags.length > 0 || message.priority != null) && (
        <div className="mt-6 flex items-center gap-2 flex-wrap">
          {message.priority != null && (
            <Badge variant="secondary">
              priority: {message.priority}
            </Badge>
          )}
          {message.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {message.message && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Message</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{message.message}</p>
          </CardContent>
        </Card>
      )}

      {message.payload && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Full Payload</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 text-sm">
              {JSON.stringify(message.payload, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Deliveries</CardTitle>
          <CardDescription>
            Status of each notification delivery.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeliveriesTable
            messageId={message.id}
            initialDeliveries={message.deliveries.map((d) => ({
              id: d.id,
              channelId: d.channelId,
              status: d.status,
              attempts: d.attempts,
              lastError: d.lastError,
              channel: {
                id: d.channel.id,
                name: d.channel.name,
                type: d.channel.type,
              },
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
