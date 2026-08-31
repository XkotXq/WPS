import { getFormatter, getTranslations } from "next-intl/server";
import StockDatePicker from "@/components/StockDatePicker";
import ReportsMaterialTabs from "@/components/ReportsMaterialTabs";
import MaterialTrendChart from "@/components/MaterialTrendChart";
import MaterialDrumCountChart from "@/components/MaterialDrumCountChart";
import MaterialBreakdownSection from "@/components/MaterialBreakdownSection";
import { api } from "@/lib/api";

const VALID_MATERIALS = ["frp", "coatedFrp", "filler"];
const DEFAULT_MATERIAL = "frp";
const SESSIONS_LIMIT = 200;

// Per material: which split_value the drum-count chart shows as separate
// (toggleable) series — a fixed categorical order per the dataviz method
// (never more than 3 here, so no "Other" folding needed). Colors are the
// app's own --primary/--chart-accent-2/-3 tokens so they track dark mode.
const SPLIT_SERIES = {
  frp: [
    { key: "mmc", nameKey: "seriesMmc", color: "var(--primary)" },
    { key: "standard", nameKey: "seriesStandard", color: "var(--chart-accent-2)" },
  ],
  coatedFrp: [
    { key: "XB", nameKey: null, color: "var(--primary)" },
    { key: "Z", nameKey: null, color: "var(--chart-accent-2)" },
  ],
  filler: [
    { key: "GRAY", nameKey: "colorGray", color: "var(--primary)" },
    { key: "WHITE", nameKey: "colorWhite", color: "var(--chart-accent-2)" },
    { key: "BLACK", nameKey: "colorBlack", color: "var(--chart-accent-3)" },
  ],
};

function dateKeyFromISO(iso) {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function sessionDateKey(session) {
  return dateKeyFromISO(session.performedAt);
}

async function loadSessions() {
  try {
    return { sessions: await api.listStockSessions(SESSIONS_LIMIT), error: false };
  } catch {
    return { sessions: [], error: true };
  }
}

// Total-length trend, split-count trend, and a per-item breakdown table
// for one material — sourced from GET /stocks/:material/trend, one SQL
// query (GROUP BY version, item) on the API side rather than fetching
// every round's full item list here and summing in JS. See SPLIT_SERIES
// above for what "item identity" and "split" mean per material, and
// api/src/stocks.js's TREND_QUERIES for the SQL itself.
async function loadMaterialTrend(material, format) {
  const rows = await api.getMaterialTrend(material);
  const series = SPLIT_SERIES[material];

  const versionsMap = new Map(); // versionId -> { dateKey, label, totalMeters, splitCounts }
  const itemsMap = new Map();

  for (const row of rows) {
    if (!versionsMap.has(row.versionId)) {
      versionsMap.set(row.versionId, {
        dateKey: dateKeyFromISO(row.performedAt),
        label: format.dateTime(new Date(row.performedAt), { day: "2-digit", month: "2-digit", year: "numeric" }),
        totalMeters: 0,
        splitCounts: Object.fromEntries(series.map((s) => [s.key, 0])),
      });
    }
    const version = versionsMap.get(row.versionId);
    version.totalMeters += row.totalLength;
    if (row.splitValue in version.splitCounts) version.splitCounts[row.splitValue] += row.drumCount;

    if (!itemsMap.has(row.groupKey)) {
      itemsMap.set(row.groupKey, {
        groupKey: row.groupKey,
        groupLabel: row.groupLabel,
        groupSubLabel: row.groupSubLabel,
        byDate: new Map(),
      });
    }
    const entry = itemsMap.get(row.groupKey);
    entry.byDate.set(version.dateKey, (entry.byDate.get(version.dateKey) || 0) + row.totalLength);
  }

  // rows arrive ordered by performed_at ASC, so Map insertion order (and
  // therefore this) is already chronological.
  const points = [...versionsMap.values()].map((v) => ({
    dateKey: v.dateKey,
    label: v.label,
    totalKm: v.totalMeters / 1000,
    splitCounts: v.splitCounts,
  }));

  const dateColumns = points.map((p) => ({ key: p.dateKey, label: p.label }));
  const lastKey = dateColumns[dateColumns.length - 1]?.key;
  const prevKey = dateColumns[dateColumns.length - 2]?.key;

  const items = [...itemsMap.values()]
    .map((entry) => {
      const byDateKm = {};
      for (const col of dateColumns) byDateKm[col.key] = (entry.byDate.get(col.key) || 0) / 1000;
      const latestKm = lastKey ? byDateKm[lastKey] ?? 0 : 0;
      const deltaKm = prevKey ? latestKm - (byDateKm[prevKey] ?? 0) : null;
      return { groupKey: entry.groupKey, groupLabel: entry.groupLabel, groupSubLabel: entry.groupSubLabel, byDateKm, deltaKm };
    })
    .sort((a, b) => b.byDateKm[lastKey] - a.byDateKm[lastKey]);

  return { points, items, dateColumns };
}

export default async function StockReportsPage({ searchParams }) {
  const params = await searchParams;
  const t = await getTranslations("stockReports");
  const tTabs = await getTranslations("stock.tabs");
  const format = await getFormatter();

  const material = VALID_MATERIALS.includes(params?.material) ? params.material : DEFAULT_MATERIAL;
  const { sessions, error: sessionsError } = await loadSessions();
  const availableDates = sessions.map(sessionDateKey);
  const session =
    (params?.date && sessions.find((candidate) => sessionDateKey(candidate) === params.date)) ?? sessions[0] ?? null;
  const selectedDateKey = session ? sessionDateKey(session) : null;

  const trend = await loadMaterialTrend(material, format).catch(() => null);
  const error = sessionsError || !trend;

  const seriesLabels = {
    mmc: t("seriesMmc"),
    standard: t("seriesStandard"),
    GRAY: t("colorGray"),
    WHITE: t("colorWhite"),
    BLACK: t("colorBlack"),
  };
  const drumCountSeries = SPLIT_SERIES[material].map((s) => ({
    key: s.key,
    color: s.color,
    name: s.nameKey ? seriesLabels[s.key] : s.key,
  }));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-navy-950 dark:text-white">{t("title")}</h1>
        {availableDates.length > 0 && (
          <StockDatePicker availableDates={availableDates} selectedDate={selectedDateKey} />
        )}
        {error && (
          <span className="text-xs font-medium text-red-600 dark:text-red-400">{t("fetchError")}</span>
        )}
      </div>
      <p className="mt-2 text-sm text-gray-500 dark:text-neutral-400">{t("subtitle")}</p>

      <div className="mt-6">
        <ReportsMaterialTabs material={material} />
      </div>

      <div className="mt-6">
        {!session && !error && (
          <p className="text-sm text-gray-500 dark:text-neutral-400">{t("noSession")}</p>
        )}
        {trend && (
          <div className="space-y-4">
            <MaterialTrendChart title={t("trendTitle", { material: tTabs(material) })} points={trend.points} />
            <MaterialDrumCountChart
              title={t("drumCountTitle", { material: tTabs(material) })}
              points={trend.points}
              series={drumCountSeries}
            />
            <MaterialBreakdownSection
              title={t("breakdownTitle", { material: tTabs(material) })}
              items={trend.items}
              dateColumns={trend.dateColumns}
            />
          </div>
        )}
      </div>
    </div>
  );
}