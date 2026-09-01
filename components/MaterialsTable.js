"use client";

import { useEffect, useMemo, useState } from "react";
import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_equals,
  filterFn_includesString,
  filterFn_inNumberRange,
  filterFn_weakEquals,
  globalFilteringFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { Columns3, Maximize2, Minimize2, MoreVertical } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import ColumnFilterHeader from "@/components/ColumnFilterHeader";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const features = tableFeatures({
  rowSelectionFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  columnVisibilityFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
});
const columnHelper = createColumnHelper();

// Not a TanStack built-in - the filter value is the set of visible
// option strings (from ColumnFilterHeader's "multiselect" variant); a
// column with no filter set (undefined) means "everything visible".
function filterFn_inSet(row, columnId, filterValue) {
  if (!filterValue) return true;
  return filterValue.includes(String(row.getValue(columnId) ?? ""));
}

const COLUMN_FILTER_FNS = {
  includesString: filterFn_includesString,
  inNumberRange: filterFn_inNumberRange,
  weakEquals: filterFn_weakEquals,
  equals: filterFn_equals,
  multiselect: filterFn_inSet,
};

function BooleanCell({ value }) {
  const tColumns = useTranslations("stock.columns");
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        value
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
          : "bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400"
      }`}
    >
      {value ? tColumns("yes") : tColumns("no")}
    </span>
  );
}

// The row keeps the raw ISO timestamp (so sorting stays chronological);
// this only formats it for display.
function DateTimeCell({ value }) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return <span>{new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(date)}</span>;
}

export default function MaterialsTable({
  data,
  columns: columnConfig,
  globalFilter: controlledGlobalFilter,
  onGlobalFilterChange: controlledSetGlobalFilter,
  showOrderRailAction = false,
  renderRowActions,
  onSelectionChange,
  rowClassName,
  onRowClick,
  isLoading = false,
  loadError = null,
}) {
  const tColumns = useTranslations("stock.columns");
  const tStock = useTranslations("stock");
  const tActions = useTranslations("stock.actions");
  const [internalGlobalFilter, setInternalGlobalFilter] = useState("");
  const globalFilter = controlledGlobalFilter ?? internalGlobalFilter;
  const setGlobalFilter = controlledSetGlobalFilter ?? setInternalGlobalFilter;
  const [columnFilters, setColumnFilters] = useState([]);
  const [sorting, setSorting] = useState([]);
  const [columnVisibility, setColumnVisibility] = useState({});
  const [orderRailFlags, setOrderRailFlags] = useState({});
  // Per-column toggle for columns with a `simpleKey` (see materials-data.js)
  // - shows row[column.simpleKey] instead of the normal value/render when
  // true, e.g. "1.6" instead of the full "FRP/Φ1.6mm".
  const [simplifiedColumns, setSimplifiedColumns] = useState({});

  function setInOrderRail(rowId, value) {
    setOrderRailFlags((prev) => ({ ...prev, [rowId]: value }));
  }

  function toggleSimplified(columnKey) {
    setSimplifiedColumns((prev) => ({ ...prev, [columnKey]: !prev[columnKey] }));
    // A filter picked against the full values (or vice versa) won't match
    // anything once the column's effective value switches to the other
    // field - drop it rather than leave the table looking like it filtered
    // out everything.
    setColumnFilters((prev) => prev.filter((f) => f.id !== columnKey));
  }

  // Bakes the toggle into the data itself (row[column.key] becomes the
  // short value while toggled) instead of swapping the column's accessor
  // function - this table's row/sort/filter models cache per-row values
  // keyed by column id and didn't invalidate when only the accessorFn
  // identity changed, so cells kept showing the full value after toggling.
  // Filtering, sorting, and the multiselect options list all read this
  // same field, so they automatically follow the toggle too.
  const effectiveData = useMemo(() => {
    const toggled = columnConfig.filter((c) => c.simpleKey && simplifiedColumns[c.key]);
    if (!toggled.length) return data;
    return data.map((row) => {
      const next = { ...row };
      for (const c of toggled) next[c.key] = row[c.simpleKey] || row[c.key];
      return next;
    });
  }, [data, columnConfig, simplifiedColumns]);

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "select",
        enableHiding: false,
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()}
            onCheckedChange={(value) => table.toggleAllRowsSelected(Boolean(value))}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          />
        ),
      }),
      ...columnConfig.map((column) =>
        columnHelper.accessor(column.key, {
          header: tColumns(column.headerKey),
          ...(column.render
            ? { cell: ({ row }) => column.render(row.original) }
            : column.type === "boolean"
            ? { cell: ({ getValue }) => <BooleanCell value={getValue()} /> }
            : column.type === "datetime"
            ? { cell: ({ getValue }) => <DateTimeCell value={getValue()} /> }
            : {}),
          ...(column.filterFn && { filterFn: COLUMN_FILTER_FNS[column.filterFn] }),
          // alphanumeric ("natural") sort compares digit runs as plain text
          // chunks - it ignores a leading "-", so e.g. -7,776 sorted before
          // -11,787 ascending (it only ever compares "7776" vs "11787" as
          // magnitudes, never accounting for the sign). Numeric columns
          // (inNumberRange filter) need a real numeric comparator instead.
          ...(column.sortable && { sortFn: column.filterFn === "inNumberRange" ? sortFn_basic : sortFn_alphanumeric }),
        })
      ),
      ...(renderRowActions
        ? [
            columnHelper.display({
              id: "actions",
              enableHiding: false,
              header: "",
              cell: ({ row }) => renderRowActions(row.original),
            }),
          ]
        : showOrderRailAction
        ? [
            columnHelper.display({
              id: "actions",
              enableHiding: false,
              header: "",
              cell: ({ row }) => {
                const inOrderRail = Boolean(orderRailFlags[row.id]);
                return (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <button
                          type="button"
                          title={tActions("moreActions")}
                          className={`rounded-md p-1.5 transition-colors ${
                            inOrderRail
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                              : "text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                          }`}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuCheckboxItem
                        checked={inOrderRail}
                        onCheckedChange={(value) => setInOrderRail(row.id, Boolean(value))}
                      >
                        {tActions("inOrderRail")}
                      </DropdownMenuCheckboxItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              },
            }),
          ]
        : []),
    ],
    [tColumns, tActions, columnConfig, showOrderRailAction, renderRowActions, orderRailFlags]
  );

  const table = useTable(
    {
      features,
      data: effectiveData,
      columns,
      getRowId: (row) => row.id,
      state: { globalFilter, columnFilters, sorting, columnVisibility },
      onGlobalFilterChange: setGlobalFilter,
      onColumnFiltersChange: setColumnFilters,
      onSortingChange: setSorting,
      onColumnVisibilityChange: setColumnVisibility,
      globalFilterFn: filterFn_includesString,
    },
    (state) => ({
      rowSelection: state.rowSelection,
      globalFilter: state.globalFilter,
      columnFilters: state.columnFilters,
      sorting: state.sorting,
      columnVisibility: state.columnVisibility,
    })
  );

  const selectedCount = Object.keys(table.state.rowSelection).length;

  // Lets a parent (e.g. the stock-checking flow, where a checked row
  // means "jest"/found) observe selection without taking over control of
  // the table's own internal rowSelection state.
  useEffect(() => {
    onSelectionChange?.(table.state.rowSelection);
  }, [table.state.rowSelection, onSelectionChange]);

  // Restricts the visible rows to the current selection - picking rows
  // across several pages/filters first, then flipping this on to see just
  // those together. Falls back on its own once nothing is selected anymore,
  // so it can't get stuck hiding every row.
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  useEffect(() => {
    if (selectedCount === 0) setShowOnlySelected(false);
  }, [selectedCount]);
  const visibleRows = showOnlySelected ? table.getRowModel().rows.filter((row) => row.getIsSelected()) : table.getRowModel().rows;
  const hideableColumns = table.getAllLeafColumns().filter((col) => col.getCanHide());

  // Distinguishes *why* the table is empty - a genuinely empty dataset
  // reads very differently from "your filters hid everything" or "the
  // fetch that feeds this table failed" (isLoading/loadError are only
  // ever set by callers doing their own client-side fetching).
  let emptyMessage = null;
  if (visibleRows.length === 0) {
    if (isLoading) emptyMessage = tStock("empty.loading");
    else if (loadError) emptyMessage = tStock("empty.loadError", { error: loadError });
    else if (data.length === 0) emptyMessage = tStock("empty.noData");
    else emptyMessage = tStock("empty.filtered");
  }

  return (
    <div>
      <Table containerClassName="max-h-[60vh] overflow-y-auto rounded-xl border border-gray-200 dark:border-neutral-800">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow
              key={headerGroup.id}
              className="border-none bg-navy-950 dark:bg-navy-500 hover:bg-navy-950 dark:hover:bg-navy-500"
            >
              {headerGroup.headers.map((header) => {
                const config = columnConfig.find((c) => c.key === header.column.id);
                const isMultiselect = config?.filterFn === "multiselect";
                return (
                  <TableHead
                    key={header.id}
                    className={`sticky top-0 z-10 h-11 bg-navy-950 px-4 text-sm font-semibold text-white dark:bg-navy-500 ${config?.className ?? ""}`}
                  >
                    <div className="flex items-center gap-1">
                      {config?.filterFn ? (
                        <ColumnFilterHeader
                          column={header.column}
                          label={tColumns(config.headerKey)}
                          variant={
                            isMultiselect
                              ? "multiselect"
                              : config.type === "boolean"
                              ? "boolean"
                              : config.filterFn === "inNumberRange"
                              ? "range"
                              : "text"
                          }
                          options={
                            isMultiselect
                              ? [...new Set(effectiveData.map((row) => String(row[config.key] ?? "")))].sort((a, b) =>
                                  a.localeCompare(b, undefined, { numeric: true })
                                )
                              : undefined
                          }
                          sortable={Boolean(config.sortable)}
                        />
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                      {config?.simpleKey && (
                        <button
                          type="button"
                          onClick={() => toggleSimplified(config.key)}
                          title={simplifiedColumns[config.key] ? tActions("showFull") : tActions("showSimplified")}
                          className={`shrink-0 rounded-md p-1 transition-colors ${
                            simplifiedColumns[config.key]
                              ? "bg-white/20 text-white"
                              : "text-white/60 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          {simplifiedColumns[config.key] ? (
                            <Maximize2 className="h-3.5 w-3.5" />
                          ) : (
                            <Minimize2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {emptyMessage ? (
            <TableRow className="border-gray-100 dark:border-neutral-800">
              <TableCell
                colSpan={table.getVisibleLeafColumns().length}
                className="px-4 py-8 text-center text-sm text-gray-500 dark:text-neutral-400"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            visibleRows.map((row, index) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? "selected" : undefined}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={`border-gray-100 dark:border-neutral-800 ${onRowClick ? "cursor-pointer" : ""} ${
                  rowClassName?.(row.original) || (index % 2 === 1 ? "bg-gray-50/60 dark:bg-neutral-900/40" : "")
                } data-[state=selected]:bg-navy-50 dark:data-[state=selected]:bg-navy-950/40 hover:bg-navy-50/60 dark:hover:bg-neutral-800/60`}
              >
                {row.getVisibleCells().map((cell) => {
                  const config = columnConfig.find((c) => c.key === cell.column.id);
                  return (
                    <TableCell
                      key={cell.id}
                      className={`px-4 py-2.5 text-gray-700 dark:text-neutral-300 ${config?.className ?? ""}`}
                    >
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-gray-500 dark:text-neutral-400">
          {tStock("selectedCount", { count: selectedCount, total: data.length })}
        </span>
        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <>
              <Button
                variant={showOnlySelected ? "default" : "outline"}
                size="sm"
                onClick={() => setShowOnlySelected((prev) => !prev)}
              >
                {showOnlySelected ? tStock("showAll") : tStock("showSelectedOnly")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => table.setRowSelection({})}>
                {tStock("clearSelection")}
              </Button>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm">
                  <Columns3 className="h-4 w-4" />
                  {tActions("columns")}
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              {hideableColumns.map((col) => {
                const config = columnConfig.find((c) => c.key === col.id);
                return (
                  <DropdownMenuCheckboxItem
                    key={col.id}
                    checked={col.getIsVisible()}
                    onCheckedChange={(value) => col.toggleVisibility(Boolean(value))}
                  >
                    {config ? tColumns(config.headerKey) : col.id}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
