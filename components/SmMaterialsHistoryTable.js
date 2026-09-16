"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import MaterialsTable from "@/components/MaterialsTable";
import FrpFilters from "@/components/FrpFilters";
import { smOperationsApi } from "@/lib/smItemsApi";

// Server caps a single page at this many rows (see wpsapi's smOperations.js
// HISTORY_LIMIT) - kept in sync here since the client decides the offset
// for the next page.
const PAGE_SIZE = 500;

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
// historyUnitId is the one addition, since CIP's own history has no
// per-unit concept to begin with (that's the whole point of Materiały SM).
const COLUMNS = [
  { key: "itemNo", headerKey: "historyItemNo", filterFn: "includesString", sortable: true },
  { key: "itemName", headerKey: "historyItemName", filterFn: "includesString", sortable: true, className: "max-w-[220px] truncate" },
  { key: "unitId", headerKey: "historyUnitId", filterFn: "includesString", sortable: true },
  { key: "operation", headerKey: "historyOperation", filterFn: "multiselect", render: (row) => <OperationLabel operation={row.operation} /> },
  { key: "quantity", headerKey: "historyQuantity", filterFn: "inNumberRange", sortable: true },
  { key: "location", headerKey: "historyLocation", filterFn: "multiselect", sortable: true },
  { key: "operator", headerKey: "historyOperator", filterFn: "includesString", sortable: true },
  { key: "time", headerKey: "historyTime", filterFn: "includesString", sortable: true },
];

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

  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    smOperationsApi
      .list(PAGE_SIZE, page * PAGE_SIZE)
      .then(({ rows, total: totalCount }) => {
        setHistory(rows);
        setTotal(totalCount);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [page]);

  const data = useMemo(() => history.map((entry) => ({ ...entry, unitId: entry.unitId || "-", time: formatTime(entry.time) })), [history]);
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  if (loading) {
    return <p className="mt-6 text-sm text-gray-400 dark:text-neutral-500">{t("loading")}</p>;
  }
  if (loadError) {
    return <p className="mt-6 text-sm text-red-600 dark:text-red-400">{t("fetchError")}</p>;
  }
  if (total === 0) {
    return <p className="mt-6 rounded-lg border border-dashed border-gray-200 dark:border-neutral-800 px-4 py-10 text-center text-sm text-gray-500 dark:text-neutral-400">{t("empty")}</p>;
  }

  return (
    <div>
      <p className="mb-3 text-sm text-gray-500 dark:text-neutral-400">{t("count", { count: total })}</p>
      <FrpFilters onGlobalFilterChange={setSearch} />
      <MaterialsTable data={data} columns={COLUMNS} globalFilter={search} onGlobalFilterChange={setSearch} />
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
    </div>
  );
}
