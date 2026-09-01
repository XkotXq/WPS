"use client";

import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const FIELD_CLS =
  "h-10 w-full rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-neutral-100 focus:border-navy-700 dark:focus:border-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400";
const LABEL_CLS = "text-xs font-medium text-gray-500 dark:text-neutral-400";

const ADVANCED_KEYS = ["operation", "handleByAfter", "locationCodeAfter"];

// Server-side filters sent straight to CIP alongside `page` (see
// history/page.js's FILTER_KEYS) - unlike the client-side search box
// further down the page, these narrow the actual query CIP runs, so they
// aren't limited to whatever fits in the current 500-row page. itemNo/
// itemName stay always visible (the two people reach for most); the rest
// live behind the toggle so the bar doesn't get cluttered.
export default function HistoryFilters({ filters }) {
  const t = useTranslations("materialsHistory");
  const router = useRouter();
  const pathname = usePathname();
  const [draft, setDraft] = useState({
    itemNo: filters.itemNo ?? "",
    itemName: filters.itemName ?? "",
    operation: filters.operation ?? "",
    handleByAfter: filters.handleByAfter ?? "",
    locationCodeAfter: filters.locationCodeAfter ?? "",
  });
  const [expanded, setExpanded] = useState(ADVANCED_KEYS.some((key) => Boolean(filters[key])));
  const hasActiveFilters = Object.values(filters).some(Boolean);

  function setField(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function apply(e) {
    e?.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(draft)) {
      if (value.trim()) params.set(key, value.trim());
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function clear() {
    setDraft({ itemNo: "", itemName: "", operation: "", handleByAfter: "", locationCodeAfter: "" });
    router.push(pathname, { scroll: false });
  }

  return (
    <form onSubmit={apply} className="mb-4 flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
        <label className="flex flex-1 flex-col gap-1">
          <span className={LABEL_CLS}>{t("filterItemNo")}</span>
          <input className={FIELD_CLS} value={draft.itemNo} onChange={(e) => setField("itemNo", e.target.value)} />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className={LABEL_CLS}>{t("filterItemName")}</span>
          <input className={FIELD_CLS} value={draft.itemName} onChange={(e) => setField("itemName", e.target.value)} />
        </label>

        <Button type="submit" size="sm" className="h-10 gap-2">
          <Search className="h-4 w-4" />
          {t("filterApply")}
        </Button>
        <Button
          type="button"
          variant={expanded ? "secondary" : "outline"}
          size="sm"
          className="h-10"
          title={t("filterMore")}
          aria-label={t("filterMore")}
          onClick={() => setExpanded((prev) => !prev)}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
        {hasActiveFilters && (
          <Button type="button" variant="ghost" size="sm" className="h-10 gap-2" onClick={clear}>
            <X className="h-4 w-4" />
            {t("filterClear")}
          </Button>
        )}
      </div>

      {expanded && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>{t("filterOperation")}</span>
            <select className={FIELD_CLS} value={draft.operation} onChange={(e) => setField("operation", e.target.value)}>
              <option value="">{t("filterOperationAll")}</option>
              <option value="InStorage">{t("operationIn")}</option>
              <option value="OutStorage">{t("operationOut")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>{t("filterOperator")}</span>
            <input className={FIELD_CLS} value={draft.handleByAfter} onChange={(e) => setField("handleByAfter", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>{t("filterLocation")}</span>
            <input className={FIELD_CLS} value={draft.locationCodeAfter} onChange={(e) => setField("locationCodeAfter", e.target.value)} />
          </label>
        </div>
      )}
    </form>
  );
}
