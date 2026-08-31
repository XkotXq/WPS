import { getTranslations } from "next-intl/server";
import CatalogTable from "@/components/CatalogTable";
import { api } from "@/lib/api";

async function loadCatalog() {
  try {
    return { catalog: await api.listCatalog(), error: false };
  } catch {
    return { catalog: [], error: true };
  }
}

export default async function FrpDatabasePage() {
  const t = await getTranslations("stockFrpDatabase");
  const { catalog, error } = await loadCatalog();

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-navy-950 dark:text-white">{t("title")}</h1>
        {error && (
          <span className="text-xs font-medium text-red-600 dark:text-red-400">
            {t("fetchError")}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-gray-500 dark:text-neutral-400">{t("subtitle")}</p>
      <div className="mt-6">
        <CatalogTable data={catalog} />
      </div>
    </div>
  );
}
