import { getTranslations } from "next-intl/server";
import WmsIssueListsTable from "@/components/WmsIssueListsTable";
import { wmsSessionInfo } from "@/lib/wmsSession";

export default async function OrdersWmsPage() {
  const t = await getTranslations("ordersWms");
  // WMS is a second login on top of the CIP one this screen was reached
  // with - only the name crosses into the browser, never the token
  // (lib/wmsSession.js).
  const wmsUser = await wmsSessionInfo();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy-950 dark:text-white">{t("title")}</h1>

      <div className="mt-6">
        <WmsIssueListsTable wmsUser={wmsUser} />
      </div>
    </div>
  );
}
