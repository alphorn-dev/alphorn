import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/sign-in");
  }

  // getSession auto-selects an accessible org. If none could be selected and
  // the user has no memberships at all, send them to project creation.
  // If they have memberships but all require 2FA they don't have, pages handle it.
  if (!session.session.activeOrganizationId) {
    const hasAnyMembership = await prisma.member.findFirst({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (!hasAnyMembership) redirect("/new-project");
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 items-center gap-3 border-b px-6">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <Breadcrumbs />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 p-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
