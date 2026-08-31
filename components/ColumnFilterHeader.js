"use client";

import { useMemo, useState } from "react";
import { ArrowDownZA, ArrowUpAZ, Filter, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const inputClasses =
  "w-full rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:border-navy-700 dark:focus:border-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400";

const sortButtonClasses = (active) =>
  `rounded-md p-1.5 transition-colors ${
    active
      ? "bg-navy-50 text-navy-700 dark:bg-navy-950/40 dark:text-navy-300"
      : "text-gray-500 hover:bg-gray-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
  }`;

const optionButtonClasses = (active) =>
  `flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
    active
      ? "border-navy-700 bg-navy-50 text-navy-700 dark:border-navy-400 dark:bg-navy-950/40 dark:text-navy-300"
      : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
  }`;

// Lets a user click a filterable column's header to open a small popover
// with sorting (asc/desc) and a filter input for just that column - a
// quicker alternative to the "More filters" panel, driven by the same
// TanStack column-filter/sorting state, so every UI stays in sync.
export default function ColumnFilterHeader({ column, label, variant = "text", sortable = false, options }) {
  const t = useTranslations("stock.filters");
  const tColumns = useTranslations("stock.columns");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => initDraft(column, variant, options));
  const [search, setSearch] = useState("");
  const isFiltered = column.getIsFiltered();
  const sortDir = sortable ? column.getIsSorted() : false;

  const visibleOptions = useMemo(() => {
    if (variant !== "multiselect") return [];
    const needle = search.trim().toLowerCase();
    return needle ? options.filter((o) => o.toLowerCase().includes(needle)) : options;
  }, [variant, options, search]);

  function handleOpenChange(next) {
    if (next) {
      setDraft(initDraft(column, variant, options));
      setSearch("");
    }
    setOpen(next);
  }

  function toggleOption(value) {
    setDraft((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  function apply() {
    if (variant === "range") {
      const [min, max] = draft;
      column.setFilterValue(min.trim() || max.trim() ? [min.trim(), max.trim()] : undefined);
    } else if (variant === "boolean") {
      column.setFilterValue(draft === true || draft === false ? draft : undefined);
    } else if (variant === "multiselect") {
      column.setFilterValue(draft.length === options.length ? undefined : draft);
    } else {
      column.setFilterValue(draft.trim() || undefined);
    }
    setOpen(false);
  }

  function reset() {
    column.setFilterValue(undefined);
    setOpen(false);
  }

  function handleKeyDown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      apply();
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-1.5 text-left text-white"
          >
            <span>{label}</span>
            {sortDir === "asc" && <ArrowUpAZ className="h-3.5 w-3.5 shrink-0 text-amber-300" />}
            {sortDir === "desc" && <ArrowDownZA className="h-3.5 w-3.5 shrink-0 text-amber-300" />}
            <Filter className={`h-3.5 w-3.5 shrink-0 ${isFiltered ? "text-amber-300" : "text-white/60"}`} />
          </button>
        }
      />
      <PopoverContent align="start" className={variant === "multiselect" ? "w-72" : "w-56"}>
        {sortable && (
          <div className="flex items-center gap-1 border-b border-gray-200 dark:border-neutral-700 pb-2">
            <button
              type="button"
              title={t("sortAsc")}
              onClick={() => column.toggleSorting(false)}
              className={sortButtonClasses(sortDir === "asc")}
            >
              <ArrowUpAZ className="h-4 w-4" />
            </button>
            <button
              type="button"
              title={t("sortDesc")}
              onClick={() => column.toggleSorting(true)}
              className={sortButtonClasses(sortDir === "desc")}
            >
              <ArrowDownZA className="h-4 w-4" />
            </button>
            {sortDir && (
              <button
                type="button"
                title={t("sortClear")}
                onClick={() => column.clearSorting()}
                className="ml-auto rounded-md p-1.5 text-gray-400 hover:bg-gray-100 dark:text-neutral-500 dark:hover:bg-neutral-800"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        <div className={sortable ? "mt-2" : ""}>
          {variant === "range" ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                value={draft[0]}
                onChange={(event) => setDraft([event.target.value, draft[1]])}
                onKeyDown={handleKeyDown}
                placeholder={t("lengthMin")}
                className={inputClasses}
              />
              <span className="text-gray-400 dark:text-neutral-500">–</span>
              <input
                type="text"
                inputMode="decimal"
                value={draft[1]}
                onChange={(event) => setDraft([draft[0], event.target.value])}
                onKeyDown={handleKeyDown}
                placeholder={t("lengthMax")}
                className={inputClasses}
              />
            </div>
          ) : variant === "multiselect" ? (
            <div>
              <input
                type="text"
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("searchOptions")}
                className={inputClasses}
              />
              <div className="mt-2 flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setDraft(options)}
                  className="font-medium text-navy-700 hover:underline dark:text-navy-300"
                >
                  {t("selectAll")}
                </button>
                <span className="text-gray-300 dark:text-neutral-600">·</span>
                <button
                  type="button"
                  onClick={() => setDraft([])}
                  className="font-medium text-navy-700 hover:underline dark:text-navy-300"
                >
                  {t("selectNone")}
                </button>
              </div>
              <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                {visibleOptions.map((value) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 text-sm text-gray-700 hover:bg-gray-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  >
                    <Checkbox checked={draft.includes(value)} onCheckedChange={() => toggleOption(value)} className="mt-0.5" />
                    <span className="break-words">{value}</span>
                  </label>
                ))}
                {visibleOptions.length === 0 && (
                  <p className="px-1 py-1 text-sm text-gray-400 dark:text-neutral-500">{t("noOptions")}</p>
                )}
              </div>
            </div>
          ) : variant === "boolean" ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDraft(true)}
                className={optionButtonClasses(draft === true)}
              >
                {tColumns("yes")}
              </button>
              <button
                type="button"
                onClick={() => setDraft(false)}
                className={optionButtonClasses(draft === false)}
              >
                {tColumns("no")}
              </button>
            </div>
          ) : (
            <input
              type="text"
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              className={inputClasses}
            />
          )}
          <div className="mt-2 flex items-center gap-2">
            <Button type="button" size="sm" onClick={apply}>
              {t("apply")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              {t("reset")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function initDraft(column, variant, options) {
  const current = column.getFilterValue();
  if (variant === "range") return current ?? ["", ""];
  if (variant === "boolean") return current;
  if (variant === "multiselect") return current ?? options;
  return current ?? "";
}
