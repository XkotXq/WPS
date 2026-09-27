import { getTranslations } from "next-intl/server";
import OrdersCipListTable from "@/components/OrdersCipListTable";

export default async function OrdersCipHistoryPage() {
  const t = await getTranslations("ordersCipHistory");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy-950 dark:text-white">{t("title")}</h1>
      <div className="mt-6">
        <OrdersCipListTable mode="history" />
      </div>
    </div>
  );
}
