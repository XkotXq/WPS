import { getTranslations } from "next-intl/server";
import StockDatePicker from "@/components/StockDatePicker";
import ReportsMaterialTabs from "@/components/ReportsMaterialTabs";
import BalanceTable from "@/components/BalanceTable";
import { api } from "@/lib/api";

const VALID_MATERIALS = ["frp", "coatedFrp", "filler"];
const DEFAULT_MATERIAL = "frp";
const SESSIONS_LIMIT = 200;

function sessionDateKey(session) {
  const date = new Date(session.performedAt);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

async function loadSessions() {
  try {
    return { sessions: await api.listStockSessions(SESSIONS_LIMIT), error: false };
  } catch {
    return { sessions: [], error: true };
  }
}

// Rounds that actually checked this material, newest first by that
// material's own performedAt (not the bundle's, which can differ once a
// round is attached to later after being started — see checks.js).
function materialSessions(sessions, material) {
  return sessions
    .filter((s) => s[material])
    .slice()
    .sort((a, b) => new Date(b[material].performedAt) - new Date(a[material].performedAt));
}

function pickSession(candidates, dateKey) {
  return (dateKey && candidates.find((s) => sessionDateKey(s) === dateKey)) ?? null;
}

async function loadSnapshot(session, material) {
  if (!session) return { snapshot: null, error: false };
  try {
    return { snapshot: await api.getSessionMaterialSnapshot(session.id, material), error: false };
  } catch {
    return { snapshot: null, error: true };
  }
}

// Per-drum diff between two chosen rounds — matched by drum number, same
// logic the old /frp app used for its "bilans" xlsx (generateBalance()):
// present in both -> compare length; only in the earlier round -> used up
// ("zużyta"); only in the later round -> new spool ("nowa szpula").
function computeBalance(fromItems, toItems) {
  const fromMap = new Map(fromItems.filter((i) => i.drumNumber).map((i) => [i.drumNumber, i]));
  const toMap = new Map(toItems.filter((i) => i.drumNumber).map((i) => [i.drumNumber, i]));
  const drums = [...new Set([...fromMap.keys(), ...toMap.keys()])].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );

  return drums.map((drum) => {
    const prevItem = fromMap.get(drum) ?? null;
    const currItem = toMap.get(drum) ?? null;
    const prevMeters = prevItem ? Number(prevItem.length) || 0 : 0;
    const currMeters = currItem ? Number(currItem.length) || 0 : 0;
    const status = prevItem && !currItem ? "used" : !prevItem && currItem ? "new" : "unchanged";
    return {
      drumNumber: drum,
      source: currItem ?? prevItem,
      prevKm: prevItem ? prevMeters / 1000 : null,
      currKm: currItem ? currMeters / 1000 : null,
      deltaKm: (currMeters - prevMeters) / 1000,
      status,
    };
  });
}

export default async function StockBalancePage({ searchParams }) {
  const params = await searchParams;
  const t = await getTranslations("stockBalance");

  const material = VALID_MATERIALS.includes(params?.material) ? params.material : DEFAULT_MATERIAL;
  const { sessions, error: sessionsError } = await loadSessions();
  const candidates = materialSessions(sessions, material);
  const availableDates = candidates.map(sessionDateKey);

  const sessionTo = pickSession(candidates, params?.dateTo) ?? candidates[0] ?? null;
  const sessionFrom = pickSession(candidates, params?.dateFrom) ?? candidates[1] ?? null;
  const dateToKey = sessionTo ? sessionDateKey(sessionTo) : null;
  const dateFromKey = sessionFrom ? sessionDateKey(sessionFrom) : null;

  const [{ snapshot: snapshotFrom, error: fromError }, { snapshot: snapshotTo, error: toError }] = await Promise.all([
    loadSnapshot(sessionFrom, material),
    loadSnapshot(sessionTo, material),
  ]);
  const error = sessionsError || fromError || toError;

  const rows =
    snapshotFrom && snapshotTo ? computeBalance(snapshotFrom.items, snapshotTo.items) : [];
  const usedCount = rows.filter((r) => r.status === "used").length;
  const newCount = rows.filter((r) => r.status === "new").length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-navy-950 dark:text-white">{t("title")}</h1>
        {candidates.length < 2 && !error && (
          <span className="text-xs font-medium text-gray-500 dark:text-neutral-400">{t("notEnoughData")}</span>
        )}
        {error && <span className="text-xs font-medium text-red-600 dark:text-red-400">{t("fetchError")}</span>}
      </div>
      <p className="mt-2 text-sm text-gray-500 dark:text-neutral-400">{t("subtitle")}</p>

      <div className="mt-6">
        <ReportsMaterialTabs material={material} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-gray-500 dark:text-neutral-400">{t("from")}</span>
        <StockDatePicker
          availableDates={availableDates}
          selectedDate={dateFromKey}
          paramName="dateFrom"
          placeholder={t("pickDate")}
        />
        <span className="text-xs font-medium text-gray-500 dark:text-neutral-400">{t("to")}</span>
        <StockDatePicker
          availableDates={availableDates}
          selectedDate={dateToKey}
          paramName="dateTo"
          placeholder={t("pickDate")}
        />
      </div>

      <div className="mt-6">
        {rows.length > 0 ? (
          <BalanceTable material={material} rows={rows} usedCount={usedCount} newCount={newCount} />
        ) : (
          !error && <p className="text-sm text-gray-500 dark:text-neutral-400">{t("pickBothDates")}</p>
        )}
      </div>
    </div>
  );
}
