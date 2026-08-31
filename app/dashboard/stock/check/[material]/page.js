import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import StockCheckPanel from "@/components/StockCheckPanel";
import { api } from "@/lib/api";
import { frpColumns, coatedFrpColumns, fillerColumns } from "@/lib/materials-data";

const VALID_MATERIALS = ["frp", "coatedFrp", "filler"];
const COLUMNS = { frp: frpColumns, coatedFrp: coatedFrpColumns, filler: fillerColumns };
const BUNDLES_LIMIT = 10;

// A round's own performed_at is set once, at creation — once other
// materials attach to it later, the most recent activity is what a
// person picking a target round actually wants to see.
function latestBundleActivity(bundle) {
  const dates = VALID_MATERIALS.map((key) => bundle[key]?.performedAt)
    .filter(Boolean)
    .map((value) => new Date(value));
  if (dates.length) return new Date(Math.max(...dates.map((d) => d.getTime())));
  return new Date(bundle.performedAt);
}

// `rawItems` is passed to the client as-is (lengths in meters, matching
// the DB and what POST /checks/:material expects) — StockCheckPanel maps
// it through MATERIAL_MAPPERS only for on-screen display (km for
// frp/coatedFrp) and submits the untouched raw rows, so the check-in
// flow never round-trips a converted length back into the database.
async function loadCheckData(material, t, tTabs, format) {
  try {
    const [rawItems, rawBundles] = await Promise.all([
      api.listCurrentItems(material),
      api.listStocksBundles(BUNDLES_LIMIT),
    ]);
    const bundles = rawBundles.map((bundle) => ({
      id: bundle.id,
      label: t("bundleLabel", {
        date: format.dateTime(latestBundleActivity(bundle), { day: "2-digit", month: "2-digit", year: "numeric" }),
        coverage:
          VALID_MATERIALS.filter((key) => bundle[key])
            .map((key) => tTabs(key))
            .join(", ") || t("bundleEmpty"),
      }),
    }));
    return { rawItems, bundles, error: false };
  } catch {
    return { rawItems: [], bundles: [], error: true };
  }
}

export default async function StockCheckPage({ params }) {
  const { material } = await params;
  if (!VALID_MATERIALS.includes(material)) notFound();

  const t = await getTranslations("stockCheck");
  const tTabs = await getTranslations("stock.tabs");
  const format = await getFormatter();
  const { rawItems, bundles, error } = await loadCheckData(material, t, tTabs, format);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-navy-950 dark:text-white">
          {t("title", { material: tTabs(material) })}
        </h1>
        {error && (
          <span className="text-xs font-medium text-red-600 dark:text-red-400">{t("fetchError")}</span>
        )}
      </div>
      <div className="mt-6">
        <StockCheckPanel material={material} rawItems={rawItems} columns={COLUMNS[material]} bundles={bundles} />
      </div>
    </div>
  );
}
