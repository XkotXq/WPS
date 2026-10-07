import { getTranslations } from "next-intl/server";
import LoginHistoryTable from "@/components/LoginHistoryTable";

export default async function OrdersTransportLoginHistoryPage() {
  const t = await getTranslations("ordersTransportLoginHistory");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy-950 dark:text-white">{t("title")}</h1>
      <div className="mt-6">
        <LoginHistoryTable />
      </div>
    </div>
  );
}
