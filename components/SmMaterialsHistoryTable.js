"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import MaterialsTable from "@/components/MaterialsTable";
import FrpFilters from "@/components/FrpFilters";
import { smOperationsApi } from "@/lib/smItemsApi";

// Same look as the filter row on Lista materiałów SM (SmMaterialsPanel.js).
const inputClasses =
  "h-9 rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-100 dark:bg-neutral-800 text-sm text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400";
const EMPTY_FILTERS = { itemNo: "", operatorLike: "", operation: "" };

// Rows per page: with more than this many entries the table gets a pager. The
// server would allow up to 500 (wpsapi's smOperations.js HISTORY_LIMIT) - the
// client decides the page size and the offset for the next page.
const PAGE_SIZE = 200;
// Rows per request when exporting everything - the most the server returns.
const EXPORT_CHUNK = 500;

// Plain text, not a pill - unlike CipMaterialsHistoryTable's own
// OperationBadge, which tags "InStorage"/"OutStorage" with a colored pill.
// "labeling" is the second half of the order workflow (see AGENTS.md):
// assigning a spool number to quantity already counted at "receipt" time
// (AssignSpoolNumbersPanel) - it doesn't change stock, so it's its own
// operation kind rather than another "receipt".
const OPERATION_LABEL_KEYS = { receipt: "operationIn", issue: "operationOut", labeling: "operationLabeling" };

function OperationLabel({ operation }) {
  const t = useTranslations("materialsHistorySm");
  return <span className="text-gray-700 dark:text-neutral-200">{t(OPERATION_LABEL_KEYS[operation] ?? "operationIn")}</span>;
}

// No more standalone "Numer jednostki" column - for an FRP entry (the only
// operation.unitId isn't blank/"-" for) the spool number now rides next to
// the item name instead, same inline treatment as a groupChild row in
// SmMaterialsPanel's own table.
function ItemNameCell({ itemName, unitId }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span>{itemName}</span>
      {unitId && unitId !== "-" && <span className="shrink-0 text-xs font-medium text-gray-400 dark:text-neutral-500">{unitId}</span>}
    </span>
  );
}

// "YYYY-MM-DD HH:mm:ss" in local time - same shape as CIP's own
// handleTimeAfter/createTime strings, so this column reads consistently
// with Historia operacji CIP even though the underlying data isn't CIP.
function formatTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// headerKey values resolve against the app-wide "stock.columns" namespace
// (see MaterialsTable.js's columnLabel) - historyItemNo/historyItemName/
// historyOperation/historyQuantity/historyLocation/historyOperator/
// historyTime are the same keys Historia operacji CIP already uses;
// historyUnitId/historyProductBatch are the additions, since CIP's own
// history has no per-unit/batch concept to begin with (that's the whole
// point of Materiały SM).
const COLUMNS = [
  { key: "itemNo", headerKey: "historyItemNo", filterFn: "includesString", sortable: true },
  {
    key: "itemName",
    headerKey: "historyItemName",
    filterFn: "includesString",
    sortable: true,
    className: "max-w-[220px] truncate",
    render: (row) => <ItemNameCell itemName={row.itemName} unitId={row.unitId} />,
  },
  { key: "operation", headerKey: "historyOperation", filterFn: "multiselect", render: (row) => <OperationLabel operation={row.operation} /> },
  { key: "quantity", headerKey: "historyQuantity", filterFn: "inNumberRange", sortable: true },
  // Batch numbers are long (e.g. PO26001030902690105@2026042301) - fixed at
  // 160px and cut off with an ellipsis, the full value on hover, instead of
  // stretching the table. Still resizable like any column.
  {
    key: "productBatch",
    headerKey: "historyProductBatch",
    filterFn: "includesString",
    sortable: true,
    className: "w-[160px] min-w-[160px] max-w-[160px] truncate",
    render: (row) => <span title={row.productBatch}>{row.productBatch}</span>,
  },
  { key: "location", headerKey: "historyLocation", filterFn: "multiselect", sortable: true },
  { key: "operator", headerKey: "historyOperator", filterFn: "includesString", sortable: true },
  { key: "time", headerKey: "historyTime", filterFn: "includesString", sortable: true },
];

// A log entry as the table (and the export) shows it.
function toTableRow(entry) {
  return { ...entry, unitId: entry.unitId || "-", productBatch: entry.productBatch || "-", time: formatTime(entry.time) };
}

export default function SmMaterialsHistoryTable() {
  const t = useTranslations("materialsHistorySm");
  // Backed by wpsapi's sm_operations (see lib/smItemsApi.js) - a receipt/
  // issue made on /materials-list-sm (SmMaterialsPanel's logOperation)
  // shows up here on the next load of this page, not live (this page
  // only re-fetches on mount or on a page change, same "not live" rule as
  // the rest of Materiały SM). `page` is 0-based state, not a URL param -
  // unlike Historia operacji CIP's own pager, nothing else on this page
  // reads from the URL.
  const [history, setHistory] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  // `draft` is what's typed in the boxes; `filters` is what "Szukaj" last sent
  // to the server - typing alone fetches nothing.
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const hasFilters = Object.values(filters).some(Boolean);

  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    smOperationsApi
      .list(PAGE_SIZE, page * PAGE_SIZE, filters)
      .then(({ rows, total: totalCount }) => {
        setHistory(rows);
        setTotal(totalCount);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [page, filters]);

  function handleSearch(event) {
    event.preventDefault();
    setPage(0);
    setFilters({ itemNo: draft.itemNo.trim(), operatorLike: draft.operatorLike.trim(), operation: draft.operation });
  }

  function handleClear() {
    setDraft(EMPTY_FILTERS);
    setPage(0);
    setFilters(EMPTY_FILTERS);
  }

  const data = useMemo(() => history.map(toTableRow), [history]);

  // Excel export = every entry matching the filters last sent with "Szukaj",
  // not just the page on screen: fetched from the server in chunks of the
  // server's page limit.
  async function loadAllRowsForExport() {
    const all = [];
    let exportTotal = Infinity;
    while (all.length < exportTotal) {
      const { rows, total: totalCount } = await smOperationsApi.list(EXPORT_CHUNK, all.length, filters);
      exportTotal = totalCount;
      if (!rows.length) break;
      all.push(...rows);
    }
    return all.map(toTableRow);
  }
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  // Nothing at all in the log (no filter applied): just the empty message.
  if (!loading && !loadError && total === 0 && !hasFilters) {
    return <p className="mt-6 rounded-lg border border-dashed border-gray-200 dark:border-neutral-800 px-4 py-10 text-center text-sm text-gray-500 dark:text-neutral-400">{t("empty")}</p>;
  }

  return (
    <div>
      <form onSubmit={handleSearch} className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-44">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-neutral-500" />
          <input
            type="text"
            value={draft.itemNo}
            onChange={(event) => setDraft((prev) => ({ ...prev, itemNo: event.target.value }))}
            placeholder={t("filters.itemNo")}
            className={`${inputClasses} w-full pl-9 pr-3`}
          />
        </div>
        <input
          type="text"
          value={draft.operatorLike}
          onChange={(event) => setDraft((prev) => ({ ...prev, operatorLike: event.target.value }))}
          placeholder={t("filters.operator")}
          className={`${inputClasses} w-44 px-3`}
        />
        <select
          value={draft.operation}
          onChange={(event) => setDraft((prev) => ({ ...prev, operation: event.target.value }))}
          className={`${inputClasses} w-44 px-3`}
        >
          <option value="">{t("filters.operation")}</option>
          {Object.entries(OPERATION_LABEL_KEYS).map(([value, labelKey]) => (
            <option key={value} value={value}>
              {t(labelKey)}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" className="gap-1.5">
          <Search className="h-4 w-4" />
          {t("filters.search")}
        </Button>
        {(hasFilters || Object.values(draft).some(Boolean)) && (
          <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
            {t("filters.clear")}
          </Button>
        )}
      </form>

      {loading ? (
        <p className="mt-6 text-sm text-gray-400 dark:text-neutral-500">{t("loading")}</p>
      ) : loadError ? (
        <p className="mt-6 text-sm text-red-600 dark:text-red-400">{t("fetchError")}</p>
      ) : total === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-gray-200 dark:border-neutral-800 px-4 py-10 text-center text-sm text-gray-500 dark:text-neutral-400">{t("noResults")}</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-gray-500 dark:text-neutral-400">{t("count", { count: total })}</p>
          <FrpFilters onGlobalFilterChange={setSearch} />
          <MaterialsTable
            data={data}
            columns={COLUMNS}
            globalFilter={search}
            onGlobalFilterChange={setSearch}
            loadAllRowsForExport={loadAllRowsForExport}
          />
          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
                {t("prevPage")}
              </Button>
              <span className="text-sm text-gray-500 dark:text-neutral-400">{t("pageOf", { current: page + 1, total: totalPages })}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                {t("nextPage")}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
