import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/server";
import { getDashboardStats } from "./messages/actions";
import { DashboardRecentMessages } from "./dashboard-recent-messages";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Mail, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const stats = await getDashboardStats();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Overview of your notification activity.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Total Messages</CardDescription>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{stats.totalMessages}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Delivered</CardDescription>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-success">
              {stats.deliveredCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Failed</CardDescription>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-destructive">
              {stats.failedCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Stale</CardDescription>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-warning">
              {stats.staleCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Pending</CardDescription>
            <Clock className="h-4 w-4 text-info" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-info">
              {stats.pendingCount}
            </p>
          </CardContent>
        </Card>
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
