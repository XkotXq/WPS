"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { enUS, pl } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function fromDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// Lets the user pick which stock-take session to view: a button showing the
// selected date opens a calendar where only days that actually have a stock
// (availableDates, from GET /stocks) are selectable - everything else is
// disabled. Picking a day sets ?date=YYYY-MM-DD, which the server component
// (app/dashboard/stock/page.js) uses to load that session instead of the
// latest one.
export default function StockDatePicker({ availableDates, selectedDate, paramName = "date", placeholder }) {
  const t = useTranslations("stock");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const availableKeys = useMemo(() => new Set(availableDates), [availableDates]);
  const availableDayObjects = useMemo(() => availableDates.map(fromDateKey), [availableDates]);
  const selected = selectedDate ? fromDateKey(selectedDate) : undefined;

  function handleSelect(date) {
    if (!date) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set(paramName, toDateKey(date));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="gap-2">
            <CalendarDays className="h-4 w-4" />
            {selected
              ? new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(
                  selected
                )
              : placeholder ?? t("pickDate")}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          locale={locale === "pl" ? pl : enUS}
          selected={selected}
          onSelect={handleSelect}
          disabled={(date) => !availableKeys.has(toDateKey(date))}
          modifiers={{ hasStock: availableDayObjects }}
          modifiersClassNames={{
            hasStock: "font-semibold text-navy-700 dark:text-navy-300",
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
