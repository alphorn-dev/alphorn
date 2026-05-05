"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

const labels: Record<string, string> = {
  "": "Dashboard",
  webhooks: "Webhooks",
  channels: "Channels",
  messages: "Messages",
  metrics: "Metrics",
  settings: "Settings",
  profile: "Profile",
  new: "New",
  edit: "Edit",
};

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return (
      <span className="text-sm text-foreground font-medium">Dashboard</span>
    );
  }

  const crumbs = segments.map((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    const label = labels[seg] ?? decodeURIComponent(seg);
    const isLast = i === segments.length - 1;
    return { href, label, isLast };
  });

  return (
    <nav className="flex items-center gap-1 text-sm">
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1">
          {i > 0 && (
            <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
          )}
          {crumb.isLast ? (
            <span className="text-foreground font-medium">{crumb.label}</span>
          ) : (
            <Link
              href={crumb.href}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
