"use client";

import { useLocale, useTranslations } from "next-intl";
import { enUS, pl } from "date-fns/locale";
import { CalendarDays, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function fromDateKey(key) {
  if (!key) return undefined;
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// Same Popover+Calendar pattern as StockDatePicker.js, in range mode -
// filters the already-loaded item trend (CipMaterialsHistoryTable) down
// to a period, client-side.
export default function HistoryDateRangePicker({ from, to, onChange }) {
  const t = useTranslations("materialsHistory");
  const locale = useLocale();
  const dateFnsLocale = locale === "pl" ? pl : enUS;
  const range = { from: fromDateKey(from), to: fromDateKey(to) };
  const hasRange = Boolean(from || to);

  function handleSelect(nextRange) {
    onChange({
      from: nextRange?.from ? toDateKey(nextRange.from) : "",
      to: nextRange?.to ? toDateKey(nextRange.to) : "",
    });
  }

  const formatter = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
  const label = range.from
    ? range.to && toDateKey(range.to) !== toDateKey(range.from)
      ? `${formatter.format(range.from)} – ${formatter.format(range.to)}`
      : formatter.format(range.from)
    : t("chartRangePlaceholder");

  return (
    <div className="flex items-center gap-1">
      <Popover>
        <PopoverTrigger
          render={
            <Button variant="outline" size="sm" className="gap-2">
              <CalendarDays className="h-4 w-4" />
              {label}
            </Button>
          }
        />
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar mode="range" locale={dateFnsLocale} selected={range} onSelect={handleSelect} />
        </PopoverContent>
      </Popover>
      {hasRange && (
        <Button variant="ghost" size="icon-sm" title={t("filterClear")} onClick={() => onChange({ from: "", to: "" })}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
