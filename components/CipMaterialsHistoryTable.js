"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import MaterialsTable from "@/components/MaterialsTable";
import FrpFilters from "@/components/FrpFilters";
import HistoryFilters from "@/components/HistoryFilters";
import HistoryDateRangePicker from "@/components/HistoryDateRangePicker";
import MaterialHistoryTrendChart from "@/components/MaterialHistoryTrendChart";
import { Button } from "@/components/ui/button";
import { fetchItemHistory } from "@/lib/cipHistory";

// Shared with the page-level `records` mapping below and with the
// per-item fetch triggered on row click - same CIP record shape either
// way, just a different itemNo filter server-side.
function mapHistoryRecord(r) {
  return {
    id: r.id,
    itemNo: r.itemNo ?? "",
    itemName: r.itemNameAfter ?? r.itemNameBefore ?? "",
    operation: r.operation ?? "",
    quantity: r.operation === "InStorage" ? r.inStorageQuantity ?? "" : r.outStorageQuantity ?? "",
    quantityAfter: r.specificationsAfter ?? "",
    location: r.locationCodeAfter ?? r.locationCodeBefore ?? "",
    operator: r.handleByAfter ?? r.handleByBefore ?? "",
    time: r.handleTimeAfter ?? r.createTime ?? "",
  };
}

// Each record already is one InStorage/OutStorage operation, carrying both
// the state before and after it (specificationsBefore/After, locationCode
// Before/After, handleBy/handleTime Before/After) plus the quantity moved
// (inStorageQuantity xor outStorageQuantity, whichever side applied).
// Sorted by time, specificationsAfter per item is exactly the item's
// running quantity over time - no need to sum deltas separately.
function OperationBadge({ operation }) {
  const t = useTranslations("materialsHistory");
  const isIn = operation === "InStorage";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isIn
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
          : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
      }`}
    >
      {isIn ? t("operationIn") : t("operationOut")}
    </span>
  );
}

const COLUMNS = [
  { key: "itemNo", headerKey: "historyItemNo", filterFn: "includesString", sortable: true },
  { key: "itemName", headerKey: "historyItemName", filterFn: "includesString", sortable: true, className: "max-w-[220px] truncate" },
  {
    key: "operation",
    headerKey: "historyOperation",
    filterFn: "multiselect",
    render: (row) => <OperationBadge operation={row.operation} />,
  },
  { key: "quantity", headerKey: "historyQuantity", filterFn: "inNumberRange", sortable: true },
  { key: "quantityAfter", headerKey: "historyQuantityAfter", filterFn: "inNumberRange", sortable: true },
  { key: "location", headerKey: "historyLocation", filterFn: "multiselect", sortable: true },
  { key: "operator", headerKey: "historyOperator", filterFn: "includesString", sortable: true },
  { key: "time", headerKey: "historyTime", filterFn: "includesString", sortable: true },
];

export default function CipMaterialsHistoryTable({ records, currentPage = 1, totalPages = 1, total = 0, filters = {} }) {
  const t = useTranslations("materialsHistory");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [chartPoints, setChartPoints] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const data = records.map(mapHistoryRecord);

  // `time` is "YYYY-MM-DD HH:mm:ss" (CIP's own format) - already
  // lexicographically sortable/comparable against a plain "YYYY-MM-DD"
  // date-input value, no parsing needed.
  const chartData = useMemo(() => {
    return chartPoints.filter((p) => {
      const day = p.label.slice(0, 10);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    });
  }, [chartPoints, dateFrom, dateTo]);

  // The general list is capped at the 500 most recent operations across
  // *every* item, so an infrequently-touched item's older rows can fall
  // out of it entirely. Selecting a row instead fetches that one item's
  // own full history from CIP (filtered by itemNo server-side), so the
  // chart isn't limited by the global page.
  async function handleRowClick(row) {
    setSelectedItem(row);
    setChartLoading(true);
    setChartError(false);
    setDateFrom("");
    setDateTo("");
    const { records: itemRecords, error } = await fetchItemHistory(row.itemNo);
    if (error) {
      setChartPoints([]);
      setChartError(true);
    } else {
      const points = itemRecords
        .map(mapHistoryRecord)
        .filter((r) => r.quantityAfter !== "")
        .slice()
        .reverse() // CIP returns newest-first; the chart wants oldest-first
        .map((r) => ({ label: r.time, qty: r.quantityAfter, operation: r.operation, operator: r.operator, amount: r.quantity }));
      setChartPoints(points);
    }
    setChartLoading(false);
  }

  function goToPage(page) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div>
      {selectedItem && (
        <div className="mb-4 rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500 dark:text-neutral-400">
              {t("itemTrendTitle", { item: selectedItem.itemName || selectedItem.itemNo })}
            </p>
            <button
              type="button"
              onClick={() => setSelectedItem(null)}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {!chartLoading && !chartError && (
            <div className="mt-2">
              <HistoryDateRangePicker
                from={dateFrom}
                to={dateTo}
                onChange={({ from, to }) => {
                  setDateFrom(from);
                  setDateTo(to);
                }}
              />
            </div>
          )}
          {chartLoading ? (
            <p className="py-8 text-center text-sm text-gray-400 dark:text-neutral-500">{t("chartLoading")}</p>
          ) : chartError ? (
            <p className="py-8 text-center text-sm text-red-600 dark:text-red-400">{t("fetchError")}</p>
          ) : chartData.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400 dark:text-neutral-500">{t("chartNoData")}</p>
          ) : (
            <MaterialHistoryTrendChart data={chartData} />
          )}
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-neutral-400">{t("count", { count: total || data.length })}</p>
        {!selectedItem && <p className="text-xs text-gray-400 dark:text-neutral-500">{t("clickItemHint")}</p>}
      </div>
      <HistoryFilters filters={filters} />
      <FrpFilters onGlobalFilterChange={setSearch} />
      <MaterialsTable
        data={data}
        columns={COLUMNS}
        globalFilter={search}
        onGlobalFilterChange={setSearch}
        onRowClick={handleRowClick}
      />

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>
            <ChevronLeft className="h-4 w-4" />
            {t("prevPage")}
          </Button>
          <span className="text-sm text-gray-500 dark:text-neutral-400">
            {t("pageOf", { current: currentPage, total: totalPages })}
          </span>
          <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => goToPage(currentPage + 1)}>
            {t("nextPage")}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
