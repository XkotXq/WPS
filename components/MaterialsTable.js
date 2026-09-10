"use client";

import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import {
  columnFilteringFeature,
  columnResizingFeature,
  columnSizingFeature,
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
import { Columns3, Download, EyeOff, Maximize2, Minimize2, MoreVertical } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import ColumnFilterHeader from "@/components/ColumnFilterHeader";
import { downloadStockXlsx } from "@/lib/xlsxExport";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
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
  columnSizingFeature,
  columnResizingFeature,
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
  // Bleeds the table out to the page's own edges (matching the standard
  // dashboard p-8 body) instead of sitting inset like the rest of the
  // page content - the default for every normal page-level table. Pass
  // false when the table lives inside its own padded/bordered container
  // (e.g. MaterialBreakdownSection's card) - there, bleeding would blow
  // past that container's own border instead of the page's.
  bleed = true,
}) {
  const tColumns = useTranslations("stock.columns");
  const tStock = useTranslations("stock");
  const tActions = useTranslations("stock.actions");
  const tFilters = useTranslations("stock.filters");
  // Most columns are labeled via a "stock.columns" translation key
  // (headerKey), but a caller can pass a literal `label` instead - e.g.
  // MaterialBreakdownSection's compare columns, headed by whichever two
  // dates are picked rather than a fixed "Poprzednio/Teraz" string.
  function columnLabel(config) {
    return config.label ?? tColumns(config.headerKey);
  }
  const [internalGlobalFilter, setInternalGlobalFilter] = useState("");
  const globalFilter = controlledGlobalFilter ?? internalGlobalFilter;
  const setGlobalFilter = controlledSetGlobalFilter ?? setInternalGlobalFilter;
  const [columnFilters, setColumnFilters] = useState([]);
  const [sorting, setSorting] = useState([]);
  const [columnVisibility, setColumnVisibility] = useState({});
  // Only ever holds entries for columns the user actually dragged - every
  // other column keeps its normal content-driven width (no entry here, no
  // inline width style below), so resizing one column never changes how
  // any other table on the site looks.
  const [columnSizing, setColumnSizing] = useState({});
  const [orderRailFlags, setOrderRailFlags] = useState({});
  // Per-column toggle for columns with a `simpleKey` (see materials-data.js)
  // - shows row[column.simpleKey] instead of the normal value/render when
  // true, e.g. "1.6" instead of the full "FRP/Φ1.6mm".
  const [simplifiedColumns, setSimplifiedColumns] = useState({});

  function setInOrderRail(rowId, value) {
    setOrderRailFlags((prev) => ({ ...prev, [rowId]: value }));
  }

  // Seeds columnSizing with the header's *currently rendered* width before
  // handing off to TanStack's own drag handler, which computes every
  // subsequent delta from whatever size was on record at drag start. Without
  // this, an untouched column (no entry in columnSizing, so it's still
  // sized by its content) would start the drag from TanStack's built-in
  // 150px default instead of its real on-screen width, and the column would
  // jump the moment you grab the handle. flushSync forces the seed to
  // commit before getResizeHandler() reads the size, since that read
  // happens synchronously inside the same call.
  function startResize(event, header) {
    event.stopPropagation();
    if (columnSizing[header.column.id] === undefined) {
      const measured = event.currentTarget.closest("th")?.getBoundingClientRect().width;
      if (measured) {
        flushSync(() => {
          setColumnSizing((prev) => ({ ...prev, [header.column.id]: measured }));
        });
      }
    }
    header.getResizeHandler()(event);
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
        enableResizing: false,
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
              enableResizing: false,
              header: "",
              cell: ({ row }) => renderRowActions(row.original),
            }),
          ]
        : showOrderRailAction
        ? [
            columnHelper.display({
              id: "actions",
              enableHiding: false,
              enableResizing: false,
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
      state: { globalFilter, columnFilters, sorting, columnVisibility, columnSizing },
      onGlobalFilterChange: setGlobalFilter,
      onColumnFiltersChange: setColumnFilters,
      onSortingChange: setSorting,
      onColumnVisibilityChange: setColumnVisibility,
      onColumnSizingChange: setColumnSizing,
      columnResizeMode: "onChange",
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

  // Exports exactly what's on screen right now: visible columns in their
  // current order (respects the "Kolumny" toggle), and whichever rows
  // getRowModel() currently returns (respects filters, sorting, and
  // showOnlySelected) - not a separate "export everything" path.
  const [exporting, setExporting] = useState(false);
  async function exportToExcel() {
    const exportColumns = table.getVisibleLeafColumns().filter((col) => col.id !== "select" && col.id !== "actions");
    const headers = exportColumns.map((col) => {
      const config = columnConfig.find((c) => c.key === col.id);
      return config ? columnLabel(config) : col.id;
    });
    const rows = visibleRows.map((row) =>
      exportColumns.map((col) => {
        const config = columnConfig.find((c) => c.key === col.id);
        const value = row.original[col.id];
        if (config?.type === "boolean") return value ? tColumns("yes") : tColumns("no");
        if (config?.type === "datetime") {
          const date = new Date(value);
          return value && !Number.isNaN(date.getTime())
            ? new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(date)
            : "";
        }
        return value ?? "";
      })
    );
    const pad = (v) => String(v).padStart(2, "0");
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
    setExporting(true);
    try {
      await downloadStockXlsx({ fileName: `eksport_${timestamp}.xlsx`, sheets: [{ sheetName: "Dane", headers, rows }] });
    } finally {
      setExporting(false);
    }
  }

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
      <div className={bleed ? "-mx-8" : undefined}>
      <Table containerClassName="max-h-[60vh] overflow-y-auto">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow
              key={headerGroup.id}
              className="border-b border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800"
            >
              {headerGroup.headers.map((header) => {
                const config = columnConfig.find((c) => c.key === header.column.id);
                const isMultiselect = config?.filterFn === "multiselect";
                // The actions column is sticky on both axes (top for the
                // header, right so it survives horizontal scroll on wide
                // tables) - it needs a higher z-index than the plain
                // top-sticky cells so it stays on top at that corner.
                const isActionsCol = header.column.id === "actions";
                const resizedWidth = columnSizing[header.column.id];
                return (
                  <TableHead
                    key={header.id}
                    style={resizedWidth ? { width: resizedWidth, minWidth: resizedWidth, maxWidth: resizedWidth } : undefined}
                    className={`sticky top-0 h-11 bg-gray-50 px-4 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:bg-neutral-800 dark:text-neutral-400 ${
                      bleed ? "first:pl-8 last:pr-8" : ""
                    } ${
                      isActionsCol ? "right-0 z-20 border-l border-gray-200 dark:border-neutral-700" : "z-10"
                    } ${config?.className ?? ""}`}
                  >
                    <ContextMenu>
                      <ContextMenuTrigger className="flex flex-1 items-center gap-1">
                        {config?.filterFn ? (
                          <ColumnFilterHeader
                            column={header.column}
                            label={columnLabel(config)}
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
                                ? "bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-white"
                                : "text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:text-neutral-500 dark:hover:bg-white/10 dark:hover:text-white"
                            }`}
                          >
                            {simplifiedColumns[config.key] ? (
                              <Maximize2 className="h-3.5 w-3.5" />
                            ) : (
                              <Minimize2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </ContextMenuTrigger>
                      {header.column.getCanHide() && (
                        <ContextMenuContent>
                          <ContextMenuItem onClick={() => header.column.toggleVisibility(false)}>
                            <EyeOff className="h-4 w-4" />
                            {tFilters("hideColumn")}
                          </ContextMenuItem>
                        </ContextMenuContent>
                      )}
                    </ContextMenu>
                    {header.column.getCanResize() && (
                      <div
                        onMouseDown={(event) => startResize(event, header)}
                        onTouchStart={(event) => startResize(event, header)}
                        onClick={(event) => event.stopPropagation()}
                        onDoubleClick={() =>
                          setColumnSizing((prev) => {
                            const { [header.column.id]: _removed, ...rest } = prev;
                            return rest;
                          })
                        }
                        title={tActions("resetColumnWidth")}
                        className={`absolute right-0 top-0 z-10 h-full w-2 cursor-col-resize touch-none select-none ${
                          header.column.getIsResizing()
                            ? "bg-navy-400/50 dark:bg-navy-400/40"
                            : "hover:bg-gray-300/60 dark:hover:bg-neutral-600/50"
                        }`}
                      />
                    )}
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
            visibleRows.map((row) => {
              // Plain flat rows, no zebra alternation - a caller-supplied
              // rowClassName (semantic status tints in BalanceTable, a
              // selected-row highlight in MaterialBreakdownSection) still
              // wins when given; otherwise rows fall back to the same
              // quiet hover/selected styling every table in the app uses
              // (Table/TableRow's own defaults - see components/ui/table.jsx).
              const stripeCls = rowClassName?.(row.original) || "";
              const isSelected = row.getIsSelected();
              // The sticky actions cell can't reuse stripeCls/the row's
              // hover-bg as-is: any alpha in those means row content that
              // scrolled out from underneath the (fixed-position) cell
              // would still show through, since a sticky element isn't
              // actually clipped by the rest of the row - it needs a fully
              // opaque background of its own, flat across every row (not
              // alternating) so the frozen column reads as one consistent
              // strip, not columns.
              const stickyBgCls = isSelected ? "!bg-gray-100 dark:!bg-neutral-800" : "bg-white dark:bg-neutral-900";
              return (
              <TableRow
                key={row.id}
                data-state={isSelected ? "selected" : undefined}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={`group border-gray-100 dark:border-neutral-800 ${onRowClick ? "cursor-pointer" : ""} ${stripeCls}`}
              >
                {row.getVisibleCells().map((cell) => {
                  const config = columnConfig.find((c) => c.key === cell.column.id);
                  const isActionsCol = cell.column.id === "actions";
                  const resizedWidth = columnSizing[cell.column.id];
                  return (
                    <TableCell
                      key={cell.id}
                      style={resizedWidth ? { width: resizedWidth, minWidth: resizedWidth, maxWidth: resizedWidth } : undefined}
                      className={`px-4 py-2.5 text-gray-700 dark:text-neutral-300 ${bleed ? "first:pl-8 last:pr-8" : ""} ${
                        isActionsCol
                          ? `sticky right-0 z-10 border-l border-gray-100 dark:border-neutral-800 ${stickyBgCls} group-hover:!bg-gray-100 dark:group-hover:!bg-neutral-700`
                          : resizedWidth
                          ? "whitespace-normal break-words"
                          : ""
                      } ${config?.className ?? ""}`}
                    >
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  );
                })}
              </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      </div>

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
          <Button variant="outline" size="sm" onClick={exportToExcel} disabled={exporting}>
            <Download className="h-4 w-4" />
            {exporting ? tActions("exporting") : tActions("exportExcel")}
          </Button>
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
                    {config ? columnLabel(config) : col.id}
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
