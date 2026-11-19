import { Badge } from "@/components/ui/badge";
import { PRIORITY_LABELS } from "@/lib/filter/schema";

const VARIANT: Record<number, "secondary" | "default" | "outline" | "destructive"> = {
  1: "secondary",
  2: "secondary",
  3: "outline",
  4: "default",
  5: "destructive",
};

/** Message priority (1-5) as its label, colored by urgency. */
export function PriorityBadge({ priority }: { priority: number }) {
  return (
    <Badge variant={VARIANT[priority] ?? "outline"} title={`Priority ${priority}`}>
      {PRIORITY_LABELS[priority] ?? priority}
    </Badge>
  );
}
