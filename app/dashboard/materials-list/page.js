import { getTranslations } from "next-intl/server";
import { ensureFreshCipSession } from "@/lib/cipSession";
import CipMaterialsTable from "@/components/CipMaterialsTable";

const CIP_INVENTORY_URL = "http://10.96.9.2/wms/materialTemporaryStorageWarehouse/query/page";

// Called from this app's own server (Server Component), so — unlike a
// browser request — it isn't subject to CIP's CORS policy; the request
// itself was captured from the page at
// http://10.96.9.2/#/materialManage/rawMaterialInOut/inventory/index.
async function loadInventory(token) {
  try {
    const res = await fetch(CIP_INVENTORY_URL, {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "pl",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        page: { size: 500, current: 1, orders: [{ column: "createTime", asc: false }], pageSize: 500, pageSizes: [100, 200, 500] },
      }),
      cache: "no-store",
    });
    const json = await res.json();
    if (!res.ok || json.code !== 0) throw new Error(json?.msg || `Błąd CIP (${res.status})`);
    return { records: json.data?.records ?? [], error: false };
  } catch {
    return { records: [], error: true };
  }
}

export default async function MaterialsListPage() {
  const t = await getTranslations("materialsList");
  const session = await ensureFreshCipSession();
  const { records, error } = session ? await loadInventory(session.token) : { records: [], error: true };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-navy-950 dark:text-white">{t("title")}</h1>
        {error && <span className="text-xs font-medium text-red-600 dark:text-red-400">{t("fetchError")}</span>}
      </div>
      <p className="mt-2 text-sm text-gray-500 dark:text-neutral-400">{t("subtitle")}</p>

      <div className="mt-6">
        <CipMaterialsTable records={records} />
      </div>
    </div>
  );
}
