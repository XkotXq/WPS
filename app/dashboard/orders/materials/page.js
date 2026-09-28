import { getTranslations } from "next-intl/server";
import OrderMaterialsSearch from "@/components/OrderMaterialsSearch";

export default async function OrdersMaterialsPage() {
  const t = await getTranslations("ordersMaterials");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy-950 dark:text-white">{t("title")}</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-neutral-400">{t("subtitle")}</p>
      <div className="mt-6">
        <OrderMaterialsSearch />
      </div>
    </div>
  );
}
