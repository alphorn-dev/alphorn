import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ErrorStats } from "./actions";

export function TopErrorsTable({ data }: { data: ErrorStats[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No delivery errors in this period.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Error</TableHead>
          <TableHead className="w-[100px] text-right">Count</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, i) => (
          <TableRow key={i}>
            <TableCell className="max-w-[500px] truncate font-mono text-xs">
              {row.error}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.count}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
