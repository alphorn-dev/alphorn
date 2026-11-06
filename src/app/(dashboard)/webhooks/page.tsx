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
import { githubAppConfig, installUrl } from "@/lib/github/app";

const GITHUB_ERRORS: Record<string, string> = {
  permission: "Only project owners and admins can connect GitHub.",
  state: "The GitHub connection expired or was started from another project. Please try again.",
  oauth: "GitHub did not authorize Alphorn. Please try again.",
  access: "Your GitHub account doesn't own that installation.",
  "org-admin": "Only owners of the GitHub organization can connect its installation.",
  limit: "Webhook limit reached. Upgrade your plan or delete a webhook to connect GitHub.",
  linked: "This GitHub installation is already connected to another project.",
  install: "Missing or invalid GitHub installation. Start again with Connect GitHub.",
};

export default async function WebhooksPage({
  searchParams,
}: {
  searchParams: Promise<{ github_error?: string }>;
}) {
  const { github_error } = await searchParams;
  const githubError = github_error ? GITHUB_ERRORS[github_error] : undefined;
  const githubConfig = githubAppConfig();
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
        <div className="flex items-center gap-2">
        {isAdminOrOwner && githubConfig && !limitReached && (
          <a href={installUrl(githubConfig)}>
            <Button variant="outline">Connect GitHub</Button>
          </a>
        )}
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
      </div>

      {githubError && (
        <p role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {githubError}
        </p>
      )}

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
