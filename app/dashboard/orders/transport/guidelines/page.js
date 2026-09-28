import { getTranslations } from "next-intl/server";
import LineMaterialRulesTable from "@/components/LineMaterialRulesTable";

export default async function OrdersTransportGuidelinesPage() {
  const t = await getTranslations("ordersTransportGuidelines");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy-950 dark:text-white">{t("title")}</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-neutral-400">{t("subtitle")}</p>
      <div className="mt-6">
        <LineMaterialRulesTable />
      </div>
    </div>
  );
}
