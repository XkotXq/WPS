import { getTranslations } from "next-intl/server";
import SmMaterialsCatalogTable from "@/components/SmMaterialsCatalogTable";

export default async function MaterialsCatalogSmPage() {
  const t = await getTranslations("materialsCatalogSm");
  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy-950 dark:text-white">{t("title")}</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-neutral-400">{t("subtitle")}</p>

      <div className="mt-6">
        <SmMaterialsCatalogTable />
      </div>
    </div>
  );
}
