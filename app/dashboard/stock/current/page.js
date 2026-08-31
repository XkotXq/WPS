import { getTranslations } from "next-intl/server";
import CurrentListWithExport from "@/components/CurrentListWithExport";
import { api } from "@/lib/api";
import { MATERIAL_MAPPERS, frpCurrentColumns, coatedFrpCurrentColumns, fillerCurrentColumns } from "@/lib/materials-data";

const VALID_MATERIALS = ["frp", "coatedFrp", "filler"];
const DEFAULT_MATERIAL = "frp";
const COLUMNS = { frp: frpCurrentColumns, coatedFrp: coatedFrpCurrentColumns, filler: fillerCurrentColumns };

async function loadCurrentItems(material) {
  try {
    const raw = await api.listCurrentItems(material);
    return { items: raw.map((item, index) => MATERIAL_MAPPERS[material](item, index)), error: false };
  } catch {
    return { items: [], error: true };
  }
}

// Live, editable inventory (frp_current/coated_frp_current/filler_current)
// - what's physically on the floor right now, as opposed to /dashboard/stock
// (a historical stock-take snapshot for a chosen date).
export default async function CurrentListPage({ searchParams }) {
  const params = await searchParams;
  const t = await getTranslations("stockCurrentList");

  const material = VALID_MATERIALS.includes(params?.material) ? params.material : DEFAULT_MATERIAL;
  const { items, error } = await loadCurrentItems(material);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-navy-950 dark:text-white">{t("title")}</h1>
        {error && <span className="text-xs font-medium text-red-600 dark:text-red-400">{t("fetchError")}</span>}
      </div>
      <p className="mt-2 text-sm text-gray-500 dark:text-neutral-400">{t("subtitle")}</p>

      <CurrentListWithExport material={material} items={items} columns={COLUMNS[material]} />
    </div>
  );
}
