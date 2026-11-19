import Link from "next/link";
import { getChannelsForOrg } from "./actions";
import { getMemberRole, requireSession } from "@/lib/auth/server";
import { getOrgLimits } from "@/lib/billing/subscription";
import { Button } from "@/components/ui/button";
import { ChannelsTable } from "./channels-table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default async function ChannelsPage() {
  const session = await requireSession();
  const orgId = session.session.activeOrganizationId;
  const [channels, role, limits] = await Promise.all([
    getChannelsForOrg(),
    getMemberRole(),
    orgId ? getOrgLimits(orgId) : Promise.resolve(null),
  ]);
  const isAdminOrOwner = role === "owner" || role === "admin";
  const channelLimit = limits?.channels ?? null;
  const limitReached =
    channelLimit !== null && channels.length >= channelLimit;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Channels</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure your notification output channels.
          </p>
        </div>
        {isAdminOrOwner &&
          (limitReached ? (
            <Tooltip>
              <TooltipTrigger render={<span tabIndex={0} />}>
                <Button disabled>Add channel</Button>
              </TooltipTrigger>
              <TooltipContent>
                Channel limit reached ({channels.length}/{channelLimit}).
                Upgrade your plan for more.
              </TooltipContent>
            </Tooltip>
          ) : (
            <Link href="/channels/new">
              <Button>Add channel</Button>
            </Link>
          ))}
      </div>

      {channels.length === 0 ? (
        <div className="mt-8 text-center">
          <p className="text-muted-foreground">No channels configured yet.</p>
          {isAdminOrOwner && (
            <Link href="/channels/new">
              <Button variant="outline" className="mt-4">
                Add your first channel
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-6">
          <ChannelsTable channels={channels} isAdminOrOwner={isAdminOrOwner} />
        </div>
      )}
    </div>
  );
}
