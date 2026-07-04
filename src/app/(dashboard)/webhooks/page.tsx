import Link from "next/link";
import { getWebhooksForOrg } from "./actions";
import { getMemberRole, requireSession } from "@/lib/auth/server";
import { getOrgLimits } from "@/lib/billing/subscription";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SquarePen } from "lucide-react";
import { formatDate } from "@/lib/format-date";

export default async function WebhooksPage() {
  const session = await requireSession();
  const orgId = session.session.activeOrganizationId;
  const [webhooks, role, limits] = await Promise.all([
    getWebhooksForOrg(),
    getMemberRole(),
    orgId ? getOrgLimits(orgId) : Promise.resolve(null),
  ]);
  const isAdminOrOwner = role === "owner" || role === "admin";
  const webhookLimit = limits?.webhooks ?? null;
  const limitReached =
    webhookLimit !== null && webhooks.length >= webhookLimit;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Webhooks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your inbound webhooks.
          </p>
        </div>
        {isAdminOrOwner &&
          (limitReached ? (
            <Tooltip>
              <TooltipTrigger render={<span tabIndex={0} />}>
                <Button disabled>Create webhook</Button>
              </TooltipTrigger>
              <TooltipContent>
                Webhook limit reached ({webhooks.length}/{webhookLimit}).
                Upgrade your plan for more.
              </TooltipContent>
            </Tooltip>
          ) : (
            <Link href="/webhooks/new">
              <Button>Create webhook</Button>
            </Link>
          ))}
      </div>

      {webhooks.length === 0 ? (
        <div className="mt-8 text-center">
          <p className="text-muted-foreground">No webhooks created yet.</p>
          {isAdminOrOwner && (
            <Link href="/webhooks/new">
              <Button variant="outline" className="mt-4">
                Create your first webhook
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Channels</TableHead>
                <TableHead>Messages</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                {isAdminOrOwner && <TableHead className="w-[50px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {webhooks.map((webhook) => (
                <TableRow key={webhook.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/webhooks/${webhook.id}`}
                      className="hover:underline"
                    >
                      {webhook.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {webhook.channels.length === 0 ? (
                      <span className="text-muted-foreground">None</span>
                    ) : (
                      <div className="flex gap-1 flex-wrap">
                        {webhook.channels.map((wc) => (
                          <Link key={wc.channelId} href={`/channels/${wc.channelId}/edit`}>
                            <Badge variant="secondary" className="hover:bg-accent">
                              {wc.channel.name}
                            </Badge>
                          </Link>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{webhook._count.messages}</TableCell>
                  <TableCell>
                    {webhook.enabled ? (
                      <Badge className="border-success/20 bg-success-muted text-success hover:bg-success-muted">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Disabled</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {formatDate(webhook.createdAt)}
                  </TableCell>
                  {isAdminOrOwner && (
                    <TableCell>
                      <Link href={`/webhooks/${webhook.id}/edit`}>
                        <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
                          <SquarePen className="h-4 w-4" />
                          <span className="sr-only">Edit</span>
                        </Button>
                      </Link>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
