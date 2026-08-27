import { CalendarDays } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import StockMaterialsTabs from "@/components/StockMaterialsTabs";
import StockDatePicker from "@/components/StockDatePicker";
import { api } from "@/lib/api";
import { MATERIAL_MAPPERS } from "@/lib/materials-data";

const MATERIAL_KEYS = ["frp", "coatedFrp", "filler"];
const SESSIONS_LIMIT = 200;

// Local calendar-day key (YYYY-MM-DD) for a session's performedAt — used to
// match the ?date= URL param and to mark which days have a stock in the
// date picker.
function sessionDateKey(session) {
  const date = new Date(session.performedAt);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

async function loadStockData(selectedDateKey) {
  const emptyItems = { frp: [], coatedFrp: [], filler: [] };

  let sessions;
  try {
    sessions = await api.listStockSessions(SESSIONS_LIMIT);
  } catch {
    return { sessions: [], session: null, items: emptyItems, error: true };
  }

  if (!sessions.length) {
    return { sessions: [], session: null, items: emptyItems, error: false };
  }

  const session =
    (selectedDateKey && sessions.find((candidate) => sessionDateKey(candidate) === selectedDateKey)) ??
    sessions[0];

  const snapshots = await Promise.all(
    MATERIAL_KEYS.map(async (key) => {
      if (!session[key]) return [key, []];
      try {
        const snapshot = await api.getSessionMaterialSnapshot(session.id, key);
        return [key, snapshot.items.map((raw, index) => MATERIAL_MAPPERS[key](raw, index))];
      } catch {
        return [key, []];
      }
    })
  );

  return { sessions, session, items: Object.fromEntries(snapshots), error: false };
}

function latestPerformedAt(session) {
  if (!session) return null;
  const dates = MATERIAL_KEYS.map((key) => session[key]?.performedAt)
    .filter(Boolean)
    .map((value) => new Date(value));
  if (dates.length) return new Date(Math.max(...dates.map((d) => d.getTime())));
  return session.performedAt ? new Date(session.performedAt) : null;
}

export default async function StockPage({ searchParams }) {
  const params = await searchParams;
  const t = await getTranslations("stock");
  const format = await getFormatter();
  const { sessions, session, items, error } = await loadStockData(params?.date);
  const asOfDate = latestPerformedAt(session);
  const availableDates = sessions.map(sessionDateKey);
  const selectedDateKey = session ? sessionDateKey(session) : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-navy-950 dark:text-white">{t("title")}</h1>
        {asOfDate && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-neutral-800 px-3 py-1 text-xs font-medium text-gray-600 dark:text-neutral-300">
            <CalendarDays className="h-3.5 w-3.5" />
            {t("asOfDate", {
              date: format.dateTime(asOfDate, { day: "2-digit", month: "2-digit", year: "numeric" }),
            })}
          </span>
        )}
        {availableDates.length > 0 && (
          <StockDatePicker availableDates={availableDates} selectedDate={selectedDateKey} />
        )}
        {!session && !error && (
          <span className="text-xs font-medium text-gray-500 dark:text-neutral-400">{t("noSession")}</span>
        )}
        {error && (
          <span className="text-xs font-medium text-red-600 dark:text-red-400">{t("fetchError")}</span>
        )}
      </div>
      <div className="mt-6">
        <StockMaterialsTabs
          frpItems={items.frp}
          coatedFrpItems={items.coatedFrp}
          fillerItems={items.filler}
        />
      </div>
    </div>
  );
}
