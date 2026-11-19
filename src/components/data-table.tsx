"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createSortedRowModel,
  functionalUpdate,
  metaHelper,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type RowData,
  type ColumnSizingState,
  type ColumnVisibilityState,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocalStorage } from "@/lib/use-local-storage";
import { cn } from "@/lib/utils";

const features = tableFeatures({
  columnSizingFeature,
  columnResizingFeature,
  columnVisibilityFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
    text: sortFn_text,
  },
  columnMeta: metaHelper<{ className?: string }>(),
});

type Features = typeof features;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- columns mix value types
export type DataTableColumn<TData extends RowData> = ColumnDef<Features, TData, any>;

export function dataTableColumns<TData extends RowData>() {
  return createColumnHelper<Features, TData>();
}

interface StoredLayout {
  sizing: ColumnSizingState;
  visibility: ColumnVisibilityState;
}
const EMPTY_LAYOUT: StoredLayout = { sizing: {}, visibility: {} };

// Clicks on these inside a row keep their own behavior instead of opening the row.
const INTERACTIVE = "a,button,input,select,textarea,label,[role=menuitem],[role=switch],[role=combobox]";

/**
 * shadcn table with resizable, hideable and sortable columns. Column widths and
 * visibility are remembered per viewer under `storageKey`.
 *
 * Sorting is client-side unless `sorting` + `onSortingChange` are passed, in
 * which case `data` must already arrive sorted (server-side, e.g. paginated).
 */
export function DataTable<TData extends RowData>({
  columns,
  data,
  storageKey,
  getRowId,
  rowHref,
  toolbar,
  actions,
  empty,
  sorting: controlledSorting,
  onSortingChange,
  initialSorting = [],
}: {
  columns: DataTableColumn<TData>[];
  data: TData[];
  storageKey: string;
  getRowId?: (row: TData) => string;
  rowHref?: (row: TData) => string | undefined;
  /** Left side of the toolbar row (filters). */
  toolbar?: React.ReactNode;
  /** Right side of the toolbar row, before the Columns menu. */
  actions?: React.ReactNode;
  /** Rendered instead of the table when `data` is empty. */
  empty?: React.ReactNode;
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  initialSorting?: SortingState;
}) {
  const router = useRouter();
  const [layout, setLayout] = useLocalStorage<StoredLayout>(`table:${storageKey}`, EMPTY_LAYOUT);
  const [localSorting, setLocalSorting] = useState<SortingState>(initialSorting);
  const sorting = controlledSorting ?? localSorting;

  const table = useTable({
    features,
    columns,
    data,
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    defaultColumn: { enableSorting: false, minSize: 60 },
    columnResizeMode: "onEnd",
    manualSorting: controlledSorting !== undefined,
    state: {
      sorting,
      columnSizing: layout.sizing,
      columnVisibility: layout.visibility,
    },
    onSortingChange: (updater) => {
      const next = functionalUpdate(updater, sorting);
      if (onSortingChange) onSortingChange(next);
      else setLocalSorting(next);
    },
    onColumnSizingChange: (updater) =>
      setLayout({ ...layout, sizing: functionalUpdate(updater, layout.sizing) }),
    onColumnVisibilityChange: (updater) =>
      setLayout({ ...layout, visibility: functionalUpdate(updater, layout.visibility) }),
  });

  const hideable = table.getAllLeafColumns().filter((c) => c.getCanHide());
  const showColumnsMenu = hideable.length > 0 && data.length > 0;
  const resizeDelta = table.state.columnResizing.deltaOffset ?? 0;

  function handleRowClick(e: React.MouseEvent<HTMLTableRowElement>, href: string) {
    const target = e.target as HTMLElement;
    // React bubbles events from portaled popovers through the row; ignore them.
    if (!e.currentTarget.contains(target) || target.closest(INTERACTIVE)) return;
    if (window.getSelection()?.toString()) return;
    if (e.metaKey || e.ctrlKey) window.open(href, "_blank", "noopener");
    else router.push(href);
  }

  return (
    <div>
      {(toolbar || actions || showColumnsMenu) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {toolbar}
          <div className="ml-auto flex items-center gap-2">
            {actions}
            {showColumnsMenu && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="outline" size="sm" className="gap-1.5" />}
                >
                  <Columns3 data-icon="inline-start" />
                  Columns
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Show columns</DropdownMenuLabel>
                    {hideable.map((column) => (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        checked={column.getIsVisible()}
                        onCheckedChange={(checked) => column.toggleVisibility(checked)}
                      >
                        {typeof column.columnDef.header === "string" ? column.columnDef.header : column.id}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setLayout(EMPTY_LAYOUT)}>
                    Reset columns
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      )}

      {data.length === 0 ? (
        empty
      ) : (
        <Table
          className="table-fixed"
          style={{ width: `max(100%, ${table.getTotalSize()}px)` }}
        >
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => {
                  const column = header.column;
                  const sorted = column.getIsSorted();
                  const SortIcon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;
                  const resize = column.getCanResize() ? header.getResizeHandler() : undefined;
                  return (
                    <TableHead
                      key={header.id}
                      style={{ width: header.getSize() }}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                      className={cn("group/head relative overflow-hidden", column.columnDef.meta?.className)}
                    >
                      {header.isPlaceholder ? null : column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={column.getToggleSortingHandler()}
                          className="-mx-1 inline-flex cursor-pointer items-center gap-1 rounded px-1 hover:bg-muted"
                        >
                          <table.FlexRender header={header} />
                          <SortIcon className={cn("size-3.5", !sorted && "text-muted-foreground/60")} />
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                      {resize && (
                        <div
                          role="separator"
                          aria-orientation="vertical"
                          aria-label="Resize column"
                          onMouseDown={resize}
                          onTouchStart={resize}
                          onDoubleClick={() => column.resetSize()}
                          style={column.getIsResizing() ? { transform: `translateX(${resizeDelta}px)` } : undefined}
                          className={cn(
                            "absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none select-none bg-border opacity-0 group-hover/head:opacity-100",
                            column.getIsResizing() && "bg-primary opacity-100",
                          )}
                        />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => {
              const href = rowHref?.(row.original);
              return (
                <TableRow
                  key={row.id}
                  onClick={href ? (e) => handleRowClick(e, href) : undefined}
                  className={href ? "cursor-pointer" : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn("overflow-hidden text-ellipsis", cell.column.columnDef.meta?.className)}
                    >
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
