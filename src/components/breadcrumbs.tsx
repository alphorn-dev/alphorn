"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

const labels: Record<string, string> = {
  "": "Dashboard",
  webhooks: "Webhooks",
  channels: "Channels",
  messages: "Messages",
  metrics: "Metrics",
  billing: "Billing",
  settings: "Settings",
  profile: "Profile",
  github: "GitHub",
  new: "New",
  edit: "Edit",
};

// Pages register a display name for a dynamic URL segment (an id) so the
// trail reads "Webhooks > Production alerts" instead of the raw id.
type SegmentLabels = Record<string, string>;
const BreadcrumbContext = createContext<{
  segmentLabels: SegmentLabels;
  setSegmentLabel: (segment: string, label: string | null) => void;
} | null>(null);

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [segmentLabels, setSegmentLabels] = useState<SegmentLabels>({});
  function setSegmentLabel(segment: string, label: string | null) {
    setSegmentLabels((prev) => {
      const next = { ...prev };
      if (label === null) delete next[segment];
      else next[segment] = label;
      return next;
    });
  }
  return (
    <BreadcrumbContext.Provider value={{ segmentLabels, setSegmentLabel }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

/** Render on a detail page to name its id segment in the breadcrumbs. */
export function BreadcrumbLabel({ segment, label }: { segment: string; label: string }) {
  const setSegmentLabel = useContext(BreadcrumbContext)?.setSegmentLabel;
  useEffect(() => {
    setSegmentLabel?.(segment, label);
    return () => setSegmentLabel?.(segment, null);
    // setSegmentLabel is recreated per provider render; segment/label drive this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment, label]);
  return null;
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const segmentLabels = useContext(BreadcrumbContext)?.segmentLabels ?? {};
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return (
      <span className="text-sm text-foreground font-medium">Dashboard</span>
    );
  }

  const crumbs = segments.map((seg, i) => {
    const href = "/" + segments.slice(0, i + 1).join("/");
    // Unnamed ids show a neutral placeholder rather than the raw id.
    const label = labels[seg] ?? segmentLabels[seg] ?? "Details";
    const isLast = i === segments.length - 1;
    return { href, label, isLast };
  });

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm">
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex min-w-0 items-center gap-1">
          {i > 0 && (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
          )}
          {crumb.isLast ? (
            <span className="truncate text-foreground font-medium">{crumb.label}</span>
          ) : (
            <Link
              href={crumb.href}
              className="truncate text-muted-foreground hover:text-foreground transition-colors"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
