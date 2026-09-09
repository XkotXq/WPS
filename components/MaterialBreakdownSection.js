"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import MaterialsTable from "@/components/MaterialsTable";
import FrpFilters from "@/components/FrpFilters";
import ItemTrendChart from "@/components/ItemTrendChart";
import StockDatePicker from "@/components/StockDatePicker";

function formatKm(value) {
  return value.toLocaleString("pl-PL", { maximumFractionDigits: 1 });
}

function DeltaCell({ value }) {
  const cls =
    value === null
      ? "text-gray-400 dark:text-neutral-500"
      : value > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : value < 0
      ? "text-rose-600 dark:text-rose-400"
      : "text-gray-400 dark:text-neutral-500";
  return (
    <span className={`tabular-nums font-medium ${cls}`}>
      {value === null ? "-" : `${value > 0 ? "+" : ""}${formatKm(value)}`}
    </span>
  );
}

// Row/column shape mirrors BalanceTable's split (see itemFields there):
// frp_stock freezes a real catalog item number (groupKey) plus
// label/name from the catalog join, so it gets its own "item number"
// column. coatedFrp/filler have no catalog - groupLabel/groupSubLabel
// there are diameter+type or diameter+color instead (see TREND_QUERIES
// in wpsApi/src/stocks.js). Feeding this through MaterialsTable (same
// component "Lista stocków"/Bilans use) gets per-column filters, sorting
// and the global search box for free instead of a bespoke table.
// fromLabel/toLabel are the actual selected dates (e.g. "25.08.2026") -
// falls back to the generic "Poprzednio/Teraz" translation (via
// MaterialsTable's columnLabel) only for the brief moment before the
// effect below has picked default dates yet.
function tableColumns(material, fromLabel, toLabel) {
  return [
    ...(material === "frp" ? [{ key: "item", headerKey: "item", filterFn: "multiselect", sortable: true }] : []),
    { key: "diameter", headerKey: "diameter", filterFn: "multiselect", sortable: true },
    ...(material === "coatedFrp" ? [{ key: "xbz", headerKey: "xbz", filterFn: "includesString", sortable: true }] : []),
    ...(material === "filler" ? [{ key: "color", headerKey: "color", filterFn: "multiselect", sortable: true }] : []),
    {
      key: "fromKm",
      headerKey: "prevKm",
      label: fromLabel,
      filterFn: "inNumberRange",
      sortable: true,
      render: (r) => <span className="tabular-nums">{r.fromKm === null ? "-" : formatKm(r.fromKm)}</span>,
    },
    {
      key: "toKm",
      headerKey: "currKm",
      label: toLabel,
      filterFn: "inNumberRange",
      sortable: true,
      render: (r) => <span className="tabular-nums">{r.toKm === null ? "-" : formatKm(r.toKm)}</span>,
    },
    { key: "deltaKm", headerKey: "delta", filterFn: "inNumberRange", sortable: true, render: (r) => <DeltaCell value={r.deltaKm} /> },
  ];
}

function toRow(material, item, fromKey, toKey) {
  const fromKm = fromKey ? item.byDateKm[fromKey] ?? 0 : null;
  const toKm = toKey ? item.byDateKm[toKey] ?? 0 : null;
  const base = { id: item.groupKey, fromKm, toKm, deltaKm: fromKey && toKey ? toKm - fromKm : null };
  if (material === "frp") return { ...base, item: item.groupKey, diameter: item.groupSubLabel || item.groupLabel || "" };
  if (material === "coatedFrp") return { ...base, diameter: item.groupLabel, xbz: item.groupSubLabel };
  return { ...base, diameter: item.groupLabel, color: item.groupSubLabel };
}

function itemDisplayName(material, item) {
  if (material === "frp") return item.groupSubLabel || item.groupLabel || item.groupKey;
  return [item.groupLabel, item.groupSubLabel].filter(Boolean).join(" / ") || item.groupKey;
}

// The length columns default to the two most recent stock rounds, but
// either side can be repointed at any earlier round via the calendar
// pickers below - the data for every round is already in
// `items[].byDateKm`, so this is pure client-side re-slicing, no
// refetch. Clicking a row (outside the compare columns) draws that
// item's full-history trend above the table, reusing the same byDateKm.
export default function MaterialBreakdownSection({ title, material, items, dateColumns }) {
  const t = useTranslations("stockReports");
  const [selectedKey, setSelectedKey] = useState(null);
  const [fromKey, setFromKey] = useState(null);
  const [toKey, setToKey] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setFromKey(dateColumns[dateColumns.length - 2]?.key ?? null);
    setToKey(dateColumns[dateColumns.length - 1]?.key ?? null);
  }, [dateColumns]);

  const selectedItem = useMemo(() => items.find((item) => item.groupKey === selectedKey) ?? null, [items, selectedKey]);

  const canCompare = dateColumns.length >= 2;
  const availableDates = useMemo(() => dateColumns.map((col) => col.key), [dateColumns]);
  const fromLabel = dateColumns.find((col) => col.key === fromKey)?.label;
  const toLabel = dateColumns.find((col) => col.key === toKey)?.label;
  const columns = useMemo(() => tableColumns(material, fromLabel, toLabel), [material, fromLabel, toLabel]);
  const rows = useMemo(() => items.map((item) => toRow(material, item, fromKey, toKey)), [items, material, fromKey, toKey]);

  function toggleItem(groupKey) {
    setSelectedKey((prev) => (prev === groupKey ? null : groupKey));
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-gray-700 dark:text-neutral-200">{title}</p>
        {!selectedItem && <p className="text-xs text-gray-400 dark:text-neutral-500">{t("clickItemHint")}</p>}
      </div>

      {canCompare && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500 dark:text-neutral-400">{t("compareFrom")}</span>
          <StockDatePicker availableDates={availableDates} selectedDate={fromKey} onSelect={setFromKey} />
          <span className="text-xs font-medium text-gray-500 dark:text-neutral-400">{t("compareTo")}</span>
          <StockDatePicker availableDates={availableDates} selectedDate={toKey} onSelect={setToKey} />
        </div>
      )}

      {selectedItem && (
        <div className="mt-3 rounded-lg border border-gray-100 dark:border-neutral-800 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500 dark:text-neutral-400">
              {t("itemTrendTitle", { item: itemDisplayName(material, selectedItem) })}
            </p>
            <button
              type="button"
              onClick={() => setSelectedKey(null)}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ItemTrendChart item={selectedItem} dateColumns={dateColumns} />
        </div>
      )}

      <div className="mt-3">
        <FrpFilters onGlobalFilterChange={setSearch} />
        <MaterialsTable
          data={rows}
          columns={columns}
          globalFilter={search}
          onGlobalFilterChange={setSearch}
          onRowClick={(row) => toggleItem(row.id)}
          rowClassName={(row) => (row.id === selectedKey ? "bg-navy-50 dark:bg-navy-950/40" : "")}
          bleed={false}
        />
      </div>
    </div>
  );
}
