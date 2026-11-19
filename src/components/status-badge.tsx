import { Badge } from "@/components/ui/badge";

const STATUS: Record<string, { label: string; className?: string; variant?: "destructive" | "secondary" }> = {
  DELIVERED: { label: "Delivered", className: "border-success/20 bg-success-muted text-success hover:bg-success-muted" },
  FAILED: { label: "Failed", variant: "destructive" },
  PROCESSING: { label: "Processing", className: "border-info/20 bg-info-muted text-info hover:bg-info-muted" },
  PENDING: { label: "Pending", variant: "secondary" },
  STALE: { label: "Stale", className: "border-warning/20 bg-warning-muted text-warning hover:bg-warning-muted" },
};

/** Delivery status badge; `icon` (e.g. the channel icon) renders before the label. */
export function StatusBadge({ status, icon }: { status: string; icon?: React.ReactNode }) {
  const s = STATUS[status] ?? { label: status, variant: "secondary" as const };
  return (
    <Badge variant={s.variant} className={s.className}>
      {icon}
      {s.label}
    </Badge>
  );
}
