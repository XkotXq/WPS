"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useLocalStorage } from "usehooks-ts";
import MaterialsTable from "@/components/MaterialsTable";
import FrpFilters from "@/components/FrpFilters";
import { SM_HISTORY_SEED, SM_HISTORY_STORAGE_KEY } from "@/lib/smOperationHistory";

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
  // Same storage key SmMaterialsPanel writes to via its own useLocalStorage
  // call - usehooks-ts syncs both through a same-tab "local-storage" event,
  // so a receipt/issue made on /materials-list-sm shows up here on
  // navigation without needing any shared backend (see AGENTS.md: nothing
  // in Materiały SM persists anywhere real yet).
  const [history] = useLocalStorage(SM_HISTORY_STORAGE_KEY, SM_HISTORY_SEED);
  const [search, setSearch] = useState("");

  const data = useMemo(() => history.map((entry) => ({ ...entry, unitId: entry.unitId || "-", time: formatTime(entry.time) })), [history]);

  if (history.length === 0) {
    return <p className="mt-6 rounded-lg border border-dashed border-gray-200 dark:border-neutral-800 px-4 py-10 text-center text-sm text-gray-500 dark:text-neutral-400">{t("empty")}</p>;
  }

  return (
    <div>
      <p className="mb-3 text-sm text-gray-500 dark:text-neutral-400">{t("count", { count: data.length })}</p>
      <FrpFilters onGlobalFilterChange={setSearch} />
      <MaterialsTable data={data} columns={COLUMNS} globalFilter={search} onGlobalFilterChange={setSearch} />
    </div>
  );
}
