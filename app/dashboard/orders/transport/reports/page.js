import { getTranslations } from "next-intl/server";
import TransportShiftReport from "@/components/TransportShiftReport";

export default async function OrdersTransportReportsPage() {
  const t = await getTranslations("ordersTransportReports");

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy-950 dark:text-white">{t("title")}</h1>
      <div className="mt-6">
        <TransportShiftReport />
      </div>
    </div>
  );
}
