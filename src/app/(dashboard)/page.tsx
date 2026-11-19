import { redirect } from "next/navigation";
import Link from "next/link";
import { getMemberRole, getSession } from "@/lib/auth/server";
import { getDashboardStats } from "./messages/actions";
import { DashboardRecentMessages } from "./dashboard-recent-messages";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Mail, CheckCircle2, XCircle, Clock, AlertTriangle, Circle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const [stats, role] = await Promise.all([getDashboardStats(), getMemberRole()]);
  const isAdminOrOwner = role === "owner" || role === "admin";

  // Each card opens the message list filtered to what it counts.
  const cards = [
    { label: "Total Messages", value: stats.totalMessages, href: "/messages", icon: Mail, color: "", iconColor: "text-muted-foreground" },
    { label: "Delivered", value: stats.deliveredCount, href: "/messages?status=DELIVERED", icon: CheckCircle2, color: "text-success", iconColor: "text-success" },
    { label: "Failed", value: stats.failedCount, href: "/messages?status=FAILED", icon: XCircle, color: "text-destructive", iconColor: "text-destructive" },
    { label: "Stale", value: stats.staleCount, href: "/messages?status=STALE", icon: AlertTriangle, color: "text-warning", iconColor: "text-warning" },
    { label: "Pending", value: stats.pendingCount, href: "/messages?status=PENDING,PROCESSING", icon: Clock, color: "text-info", iconColor: "text-info" },
  ];

  const steps = [
    { label: "Create a webhook", description: "The URL your services send notifications to.", href: "/webhooks/new", done: stats.setup.hasWebhook },
    { label: "Add a channel", description: "Where notifications go: Slack, email, Telegram, ...", href: "/channels/new", done: stats.setup.hasChannel },
    { label: "Link a channel to a webhook", description: "Open a webhook and add channels under Output Channels.", href: "/webhooks", done: stats.setup.hasLinkedChannel },
    { label: "Send your first message", description: "Use the Send test button on a webhook, or call its URL.", href: "/webhooks", done: stats.totalMessages > 0 },
  ];
  const showSetup = isAdminOrOwner && steps.some((s) => !s.done);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Overview of your notification activity.
      </p>

      {showSetup && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Get started</CardTitle>
            <CardDescription>
              {steps.filter((s) => s.done).length} of {steps.length} steps done.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="divide-y rounded-lg border">
              {steps.map((step) => (
                <li key={step.label}>
                  <Link
                    href={step.href}
                    className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50"
                  >
                    {step.done ? (
                      <CheckCircle2 className="size-5 shrink-0 text-success" aria-label="Done" />
                    ) : (
                      <Circle className="size-5 shrink-0 text-muted-foreground" aria-label="To do" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-medium", step.done && "text-muted-foreground line-through")}>
                        {step.label}
                      </p>
                      <p className="text-xs text-muted-foreground">{step.description}</p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className="rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardDescription>{card.label}</CardDescription>
                <card.icon className={cn("h-4 w-4", card.iconColor)} />
              </CardHeader>
              <CardContent>
                <p className={cn("text-3xl font-bold tabular-nums", card.color)}>{card.value}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent Messages</CardTitle>
          <CardDescription>Last 10 notifications received.</CardDescription>
        </CardHeader>
        <CardContent>
          <DashboardRecentMessages messages={stats.recentMessages} />
        </CardContent>
      </Card>
    </div>
  );
}
