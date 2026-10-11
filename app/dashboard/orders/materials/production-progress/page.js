import { getTranslations } from "next-intl/server";
import ProductionProgressTable from "@/components/ProductionProgressTable";

export default async function ProductionProgressPage() {
  const t = await getTranslations("productionProgress");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy-950 dark:text-white">{t("title")}</h1>
      <div className="mt-6">
        <ProductionProgressTable />
      </div>
    </div>
  );
}
