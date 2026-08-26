import { CalendarDays } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import StockMaterialsTabs from "@/components/StockMaterialsTabs";
import { stockAsOfDate } from "@/lib/materials-data";

export default async function StockPage() {
  const t = await getTranslations("stock");
  const format = await getFormatter();
  const formattedDate = format.dateTime(stockAsOfDate, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-navy-950 dark:text-white">{t("title")}</h1>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-neutral-800 px-3 py-1 text-xs font-medium text-gray-600 dark:text-neutral-300">
          <CalendarDays className="h-3.5 w-3.5" />
          {t("asOfDate", { date: formattedDate })}
        </span>
      </div>
      <div className="mt-6">
        <StockMaterialsTabs />
      </div>
    </div>
  );
}
