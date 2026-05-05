"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession, authClient } from "@/lib/auth/client";
import { OrgSwitcher } from "./org-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { APP_VERSION } from "@/lib/version";
import {
  LayoutDashboard,
  Link2,
  Bell,
  Mail,
  BarChart3,
  CreditCard,
  Settings,
  LogOut,
  User,
} from "lucide-react";

const navItems = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Webhooks", href: "/webhooks", icon: Link2 },
  { title: "Channels", href: "/channels", icon: Bell },
  { title: "Messages", href: "/messages", icon: Mail },
  { title: "Metrics", href: "/metrics", icon: BarChart3 },
  { title: "Billing", href: "/billing", icon: CreditCard },
  { title: "Settings", href: "/settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const [memberRole, setMemberRole] = useState<string | null>(null);

  const activeOrganizationId = (session?.session as Record<string, unknown>)?.activeOrganizationId;

  useEffect(() => {
    if (!session?.user?.id) return;
    authClient.organization.getFullOrganization().then(({ data }) => {
      if (!data) return;
      const me = data.members.find((m: { userId: string }) => m.userId === session.user.id);
      setMemberRole(me?.role ?? null);
    });
  }, [session?.user?.id, activeOrganizationId]);

  const isAdminOrOwner = memberRole === "owner" || memberRole === "admin";

  const visibleNavItems = navItems.filter(
    (item) =>
      (item.href !== "/settings" && item.href !== "/billing") || isAdminOrOwner
  );

  const initials =
    session?.user?.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?";

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight">
          <Image src="/logo.svg" alt="Alphorn" width={28} height={28} />
          Alphorn
          <span className="ml-0.5 rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            Beta
          </span>
        </Link>
        <div className="mt-3">
          <OrgSwitcher />
        </div>
      </SidebarHeader>

      <SidebarContent className="pt-2">
        <SidebarGroup className="px-2">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {visibleNavItems.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      render={<Link href={item.href} />}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-md p-2 hover:bg-accent transition-colors">
            <Avatar className="size-8">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 text-left text-sm">
              <p className="font-medium truncate">{session?.user?.name}</p>
              <p className="text-muted-foreground text-xs truncate">
                {session?.user?.email}
              </p>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[220px]">
            <DropdownMenuItem onClick={() => window.location.href = "/profile"}>
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                await signOut();
                window.location.href = "/sign-in";
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <p className="text-muted-foreground text-[10px] text-center mt-2">
          v{APP_VERSION}
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
