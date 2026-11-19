import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, GitPullRequest } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireOrgSession } from "@/lib/auth/server";
import { githubAppConfig, installUrl } from "@/lib/github/app";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// `i=<installationId>:<login>` entries, written by /api/github/callback after
// OAuth. Display only: "Connect" re-runs the verified connect flow for that id.
const ENTRY = /^(\d{1,19}):([A-Za-z0-9-]{1,39})$/;

export default async function GithubPickerPage({
  searchParams,
}: {
  searchParams: Promise<{ i?: string | string[] }>;
}) {
  const config = githubAppConfig();
  if (!config) redirect("/webhooks");
  const { orgId } = await requireOrgSession();

  const { i } = await searchParams;
  const installations = [i ?? []].flat().flatMap((entry) => {
    const m = ENTRY.exec(entry);
    return m ? [{ id: m[1], login: m[2] }] : [];
  });

  const links = await prisma.githubInstallation.findMany({
    where: { organizationId: orgId, installationId: { in: installations.map((x) => BigInt(x.id)) } },
    select: { installationId: true, webhookId: true },
  });
  const linkedWebhook = new Map(links.map((l) => [l.installationId.toString(), l.webhookId]));

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-4">
        <Link href="/webhooks">
          <Button variant="ghost" size="icon" aria-label="Back to webhooks">
            <ArrowLeft data-icon />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Connect GitHub</h1>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Choose a GitHub account</CardTitle>
          <CardDescription>
            Alphorn is already installed on these accounts. Connecting one creates a webhook in this
            project for all repositories the installation covers.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {installations.map(({ id, login }) => {
            const webhookId = linkedWebhook.get(id);
            return (
              <div key={id} className="flex items-center justify-between gap-4 py-3 first:pt-0">
                <div className="flex items-center gap-2 font-medium">
                  <GitPullRequest className="size-4 text-muted-foreground" />
                  {login}
                </div>
                {webhookId ? (
                  <Link href={`/webhooks/${webhookId}`}>
                    <Button variant="outline" size="sm">Already connected</Button>
                  </Link>
                ) : (
                  <a href={`/api/github/callback?installation_id=${id}`}>
                    <Button size="sm">Connect</Button>
                  </a>
                )}
              </div>
            );
          })}
          <div className="pt-3">
            <a href={installUrl(config)} className="text-sm text-primary hover:underline">
              Install Alphorn on another GitHub account
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
