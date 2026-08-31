"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import MaterialsTable from "@/components/MaterialsTable";
import FrpFilters from "@/components/FrpFilters";
import { MATERIAL_MAPPERS } from "@/lib/materials-data";
import { submitCheckAction } from "@/app/dashboard/stock/check/[material]/actions";

const inputClasses =
  "mt-1 w-full rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:border-navy-700 dark:focus:border-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400";

// The table's built-in row-selection checkboxes double as the jest/brak
// toggle here: a selected row is "jest" (found), everything else counts
// as "brak" (missing) at submit time.
export default function StockCheckPanel({ material, rawItems, columns, bundles }) {
  const t = useTranslations("stockCheck");
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [target, setTarget] = useState("new");
  const [performedBy, setPerformedBy] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Display only - lengths are converted to km here for frp/coatedFrp
  // (see mapFrpItem/mapCoatedFrpItem). Submission always reads from
  // rawItems below so the raw, in-meters value is what reaches the API.
  const displayItems = useMemo(
    () => rawItems.map((raw, index) => MATERIAL_MAPPERS[material](raw, index)),
    [rawItems, material]
  );

  const selectedIds = useMemo(
    () => new Set(Object.keys(selection).filter((id) => selection[id])),
    [selection]
  );
  const foundCount = selectedIds.size;
  const missingCount = rawItems.length - foundCount;

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const found = rawItems.filter((item) => selectedIds.has(String(item.id)));
      await submitCheckAction(material, {
        items: found,
        yesCount: foundCount,
        noCount: missingCount,
        performedBy: performedBy.trim() || undefined,
        stocksId: target === "new" ? undefined : target,
      });
      setPickerOpen(false);
      setSelection({});
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <FrpFilters onGlobalFilterChange={setSearch} />
      <MaterialsTable
        data={displayItems}
        columns={columns}
        globalFilter={search}
        onGlobalFilterChange={setSearch}
        onSelectionChange={setSelection}
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3">
        <span className="text-sm text-gray-600 dark:text-neutral-300">
          {t("summary", { found: foundCount, missing: missingCount, total: rawItems.length })}
        </span>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger
            render={
              <Button size="sm" className="gap-2">
                <ClipboardCheck className="h-4 w-4" />
                {t("finish")}
              </Button>
            }
          />
          <PopoverContent align="end" className="w-80">
            <p className="text-sm font-medium text-gray-700 dark:text-neutral-200">{t("pickTarget")}</p>
            <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-neutral-200 dark:hover:bg-neutral-800">
                <input
                  type="radio"
                  name={`target-${material}`}
                  checked={target === "new"}
                  onChange={() => setTarget("new")}
                />
                {t("newStock")}
              </label>
              {bundles.map((bundle) => (
                <label
                  key={bundle.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  <input
                    type="radio"
                    name={`target-${material}`}
                    checked={target === bundle.id}
                    onChange={() => setTarget(bundle.id)}
                  />
                  <span>{bundle.label}</span>
                </label>
              ))}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-neutral-400">
                {t("performedBy")}
              </label>
              <input
                type="text"
                value={performedBy}
                onChange={(event) => setPerformedBy(event.target.value)}
                className={inputClasses}
              />
            </div>
            {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
            <Button size="sm" className="mt-3 w-full" onClick={handleConfirm} disabled={submitting}>
              {t("confirm")}
            </Button>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
