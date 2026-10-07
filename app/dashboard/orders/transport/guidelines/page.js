import { getTranslations } from "next-intl/server";
import LineMaterialRulesTable from "@/components/LineMaterialRulesTable";

export default async function OrdersTransportGuidelinesPage() {
  const t = await getTranslations("ordersTransportGuidelines");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy-950 dark:text-white">{t("title")}</h1>
      <div className="mt-6">
        <LineMaterialRulesTable />
      </div>
    </div>
  );
}
