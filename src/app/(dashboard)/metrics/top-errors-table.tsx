import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CopyButton } from "@/components/copy-button";
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
          <TableHead className="w-[44px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, i) => (
          <TableRow key={i}>
            <TableCell className="max-w-[500px] truncate font-mono text-xs" title={row.error}>
              {row.error}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.count}
            </TableCell>
            <TableCell>
              <CopyButton
                value={row.error}
                label="Copy error"
                toastMessage="Error copied"
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground"
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
