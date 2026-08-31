"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import ItemTrendChart from "@/components/ItemTrendChart";

function formatKm(value) {
  return value.toLocaleString("pl-PL", { maximumFractionDigits: 1 });
}

// Table-view twin of MaterialTrendChart's single total line — dozens of
// distinct items/diameters is well past the ~7-8 series a chart can
// carry as separate lines (see dataviz skill), so per-item totals live
// in the table instead of a many-line chart. Clicking a row draws that
// item's own trend above the table, reusing the byDateKm this component
// already has — no extra fetch. Generic across materials: `items` rows
// carry {groupKey, groupLabel, groupSubLabel, byDateKm, deltaKm} however
// the caller defined "item identity" for that material (see
// loadMaterialTrend in reports/page.js).
export default function MaterialBreakdownSection({ title, items, dateColumns }) {
  const t = useTranslations("stockReports");
  const [selectedKey, setSelectedKey] = useState(null);

  const selectedItem = useMemo(() => items.find((item) => item.groupKey === selectedKey) ?? null, [items, selectedKey]);

  function toggleItem(groupKey) {
    setSelectedKey((prev) => (prev === groupKey ? null : groupKey));
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700 dark:text-neutral-200">{title}</p>
        {!selectedItem && <p className="text-xs text-gray-400 dark:text-neutral-500">{t("clickItemHint")}</p>}
      </div>

      {selectedItem && (
        <div className="mt-3 rounded-lg border border-gray-100 dark:border-neutral-800 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500 dark:text-neutral-400">
              {t("itemTrendTitle", { item: selectedItem.groupLabel || selectedItem.groupKey })}
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

      <Table containerClassName="mt-3 max-h-[28rem] overflow-y-auto rounded-lg border border-gray-100 dark:border-neutral-800">
        <TableHeader>
          <TableRow className="border-none bg-navy-950 dark:bg-navy-500 hover:bg-navy-950 dark:hover:bg-navy-500">
            <TableHead className="sticky top-0 z-10 bg-navy-950 dark:bg-navy-500 text-white">{t("columnItem")}</TableHead>
            {dateColumns.map((col) => (
              <TableHead key={col.key} className="sticky top-0 z-10 bg-navy-950 dark:bg-navy-500 text-right text-white">
                {col.label}
              </TableHead>
            ))}
            <TableHead className="sticky top-0 z-10 bg-navy-950 dark:bg-navy-500 text-right text-white">{t("columnDelta")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => (
            <TableRow
              key={item.groupKey}
              onClick={() => toggleItem(item.groupKey)}
              data-state={item.groupKey === selectedKey ? "selected" : undefined}
              className={`cursor-pointer border-gray-100 dark:border-neutral-800 ${
                index % 2 === 1 ? "bg-gray-50/60 dark:bg-neutral-900/40" : ""
              } data-[state=selected]:bg-navy-50 dark:data-[state=selected]:bg-navy-950/40 hover:bg-navy-50/60 dark:hover:bg-neutral-800/60`}
            >
              <TableCell className="text-gray-700 dark:text-neutral-300">
                <div className="font-medium text-gray-900 dark:text-neutral-100">{item.groupLabel || item.groupKey}</div>
                <div className="text-xs text-gray-400 dark:text-neutral-500">{item.groupSubLabel}</div>
              </TableCell>
              {dateColumns.map((col) => (
                <TableCell key={col.key} className="text-right tabular-nums text-gray-700 dark:text-neutral-300">
                  {item.byDateKm[col.key] ? formatKm(item.byDateKm[col.key]) : "—"}
                </TableCell>
              ))}
              <TableCell
                className={`text-right tabular-nums font-medium ${
                  item.deltaKm === null
                    ? "text-gray-400 dark:text-neutral-500"
                    : item.deltaKm > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : item.deltaKm < 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-gray-400 dark:text-neutral-500"
                }`}
              >
                {item.deltaKm === null ? "—" : `${item.deltaKm > 0 ? "+" : ""}${formatKm(item.deltaKm)}`}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
