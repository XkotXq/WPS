import { getTranslations } from "next-intl/server";
import { ensureFreshCipSession } from "@/lib/cipSession";
import { loadCipInventory } from "@/lib/cipInventory";
import CipMaterialsTable from "@/components/CipMaterialsTable";

export default async function MaterialsListPage() {
  const t = await getTranslations("materialsList");
  const session = await ensureFreshCipSession();
  const { records, error } = await loadCipInventory(session);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-navy-950 dark:text-white">{t("title")}</h1>
        {error && <span className="text-xs font-medium text-red-600 dark:text-red-400">{t("fetchError")}</span>}
      </div>
      <p className="mt-2 text-sm text-gray-500 dark:text-neutral-400">{t("subtitle")}</p>

      <div className="mt-6">
        <CipMaterialsTable records={records} />
      </div>
    </div>
  );
}
