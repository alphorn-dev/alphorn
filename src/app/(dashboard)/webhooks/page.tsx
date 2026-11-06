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
import { ChevronDown, GitPullRequest, SquarePen, Webhook } from "lucide-react";
import { formatDate } from "@/lib/format-date";
import { githubAppConfig, installUrl } from "@/lib/github/app";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Reasons /api/github/callback redirects back here with (?github_error=...).
const GITHUB_ERRORS: Record<string, string> = {
  permission: "Only project owners and admins can connect GitHub.",
  state: "The GitHub connection expired or was started from another project. Please try again.",
  oauth: "GitHub did not authorize Alphorn. Please try again.",
  access: "Your GitHub account doesn't own that installation.",
  "org-admin": "Only owners of the GitHub organization can connect its installation.",
  limit: "Webhook limit reached. Upgrade your plan or delete a webhook to connect GitHub.",
  linked: "This GitHub installation is already connected to another project.",
  install: "Missing or invalid GitHub installation. Please try again.",
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
          ) : githubConfig ? (
            // "From an app" sources: GitHub today, more integrations later.
            // Split button: the main part creates a custom webhook, the arrow
            // opens "From an app" sources (GitHub today, more integrations later).
            <div className="flex">
              <Link href="/webhooks/new">
                <Button className="rounded-r-none border-r-0">Create webhook</Button>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      size="icon"
                      className="rounded-l-none border-l-primary-foreground/20"
                      aria-label="More ways to create a webhook"
                    />
                  }
                >
                  <ChevronDown />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuItem render={<Link href="/webhooks/new" />} className="items-start">
                    <Webhook className="mt-0.5" />
                    <div>
                      <div>Webhook URL</div>
                      <div className="text-xs text-muted-foreground">
                        For any service that can send webhooks
                      </div>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>From an app</DropdownMenuLabel>
                    <DropdownMenuItem
                      render={<a href={installUrl(githubConfig)} />}
                      className="items-start"
                    >
                      <GitPullRequest className="mt-0.5" />
                      <div>
                        <div>GitHub repositories</div>
                        <div className="text-xs text-muted-foreground">
                          Pick repositories on GitHub, no setup per repo
                        </div>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <Link href="/webhooks/new">
              <Button>Create webhook</Button>
            </Link>
          ))}
      </div>

      {githubError && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
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
