import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "DELIVERED":
      return (
        <Badge className="border-success/20 bg-success-muted text-success hover:bg-success-muted">
          Delivered
        </Badge>
      );
    case "FAILED":
      return <Badge variant="destructive">Failed</Badge>;
    case "PROCESSING":
      return (
        <Badge className="border-info/20 bg-info-muted text-info hover:bg-info-muted">
          Processing
        </Badge>
      );
    case "PENDING":
      return <Badge variant="secondary">Pending</Badge>;
    case "STALE":
      return (
        <Badge className="border-warning/20 bg-warning-muted text-warning hover:bg-warning-muted">
          Stale
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}
