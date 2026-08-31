"use client";

import { useEffect, useMemo, useState } from "react";
import {
  columnFilteringFeature,
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
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { MoreVertical } from "lucide-react";
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
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
});
const columnHelper = createColumnHelper();

// Not a TanStack built-in — the filter value is the set of visible
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

export default function MaterialsTable({
  data,
  columns: columnConfig,
  globalFilter: controlledGlobalFilter,
  onGlobalFilterChange: controlledSetGlobalFilter,
  showOrderRailAction = false,
  renderRowActions,
  onSelectionChange,
  rowClassName,
}) {
  const tColumns = useTranslations("stock.columns");
  const tStock = useTranslations("stock");
  const tActions = useTranslations("stock.actions");
  const [internalGlobalFilter, setInternalGlobalFilter] = useState("");
  const globalFilter = controlledGlobalFilter ?? internalGlobalFilter;
  const setGlobalFilter = controlledSetGlobalFilter ?? setInternalGlobalFilter;
  const [columnFilters, setColumnFilters] = useState([]);
  const [sorting, setSorting] = useState([]);
  const [orderRailFlags, setOrderRailFlags] = useState({});

  function setInOrderRail(rowId, value) {
    setOrderRailFlags((prev) => ({ ...prev, [rowId]: value }));
  }

  const columns = useMemo(
    () => [
      columnHelper.display({
        id: "select",
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
            : column.type === "boolean" && { cell: ({ getValue }) => <BooleanCell value={getValue()} /> }),
          ...(column.filterFn && { filterFn: COLUMN_FILTER_FNS[column.filterFn] }),
          ...(column.sortable && { sortFn: sortFn_alphanumeric }),
        })
      ),
      ...(renderRowActions
        ? [
            columnHelper.display({
              id: "actions",
              header: "",
              cell: ({ row }) => renderRowActions(row.original),
            }),
          ]
        : showOrderRailAction
        ? [
            columnHelper.display({
              id: "actions",
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
      data,
      columns,
      getRowId: (row) => row.id,
      state: { globalFilter, columnFilters, sorting },
      onGlobalFilterChange: setGlobalFilter,
      onColumnFiltersChange: setColumnFilters,
      onSortingChange: setSorting,
      globalFilterFn: filterFn_includesString,
    },
    (state) => ({
      rowSelection: state.rowSelection,
      globalFilter: state.globalFilter,
      columnFilters: state.columnFilters,
      sorting: state.sorting,
    })
  );

  const selectedCount = Object.keys(table.state.rowSelection).length;

  // Lets a parent (e.g. the stock-checking flow, where a checked row
  // means "jest"/found) observe selection without taking over control of
  // the table's own internal rowSelection state.
  useEffect(() => {
    onSelectionChange?.(table.state.rowSelection);
  }, [table.state.rowSelection, onSelectionChange]);

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
                            ? [...new Set(data.map((row) => String(row[config.key] ?? "")))].sort((a, b) =>
                                a.localeCompare(b, undefined, { numeric: true })
                              )
                            : undefined
                        }
                        sortable={Boolean(config.sortable)}
                      />
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row, index) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() ? "selected" : undefined}
              className={`border-gray-100 dark:border-neutral-800 ${
                rowClassName?.(row.original) || (index % 2 === 1 ? "bg-gray-50/60 dark:bg-neutral-900/40" : "")
              } data-[state=selected]:bg-navy-50 dark:data-[state=selected]:bg-navy-950/40 hover:bg-navy-50/60 dark:hover:bg-neutral-800/60`}
            >
              {row.getAllCells().map((cell) => {
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
          ))}
        </TableBody>
      </Table>

      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-gray-500 dark:text-neutral-400">
          {tStock("selectedCount", { count: selectedCount, total: data.length })}
        </span>
        {selectedCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => table.setRowSelection({})}>
            {tStock("clearSelection")}
          </Button>
        )}
      </div>
    </div>
  );
}
