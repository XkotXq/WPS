import { getTranslations } from "next-intl/server";
import { ensureFreshCipSession } from "@/lib/cipSession";
import CipMaterialsTable from "@/components/CipMaterialsTable";

const CIP_INVENTORY_URL = "http://10.96.9.2/wms/materialTemporaryStorageWarehouse/query/page";

// getCipSession's bypass session (SKIP_CIP_AUTH=true) carries this token
// instead of a real CIP one - loadInventory would just fail against the
// real CIP endpoint with it, so this page substitutes fixed sample rows
// instead, to keep the table usable while developing without CIP access.
const BYPASS_TOKEN = "local-bypass";

const TEST_RECORDS = [
  { id: "test-1", itemNo: "993916000000219", itemName: "FRP 1.8mm/VIP", specifications: 42, locationCode: "ST 01", note: "Dane testowe (SKIP_CIP_AUTH)", createTime: "2026-08-20 08:15:00" },
  { id: "test-2", itemNo: "993916000000346", itemName: "FRP 2.3mm/VIP", specifications: 18, locationCode: "ST 02", note: "Dane testowe (SKIP_CIP_AUTH)", createTime: "2026-08-20 08:20:00" },
  { id: "test-3", itemNo: "993916000000404", itemName: "Coated FRP 1.8/1.9-/-M", specifications: 7, locationCode: "ST 1-4", note: "Dane testowe (SKIP_CIP_AUTH)", createTime: "2026-08-21 11:05:00" },
  { id: "test-4", itemNo: "993916000000239", itemName: "Coated FRP/1.3mm*1.4mm", specifications: 25, locationCode: "WS 01", note: "Dane testowe (SKIP_CIP_AUTH)", createTime: "2026-08-22 09:40:00" },
  { id: "test-5", itemNo: "993916000000076", itemName: "Coated FRP 2.0*2.1-H-M (High Module)", specifications: 3, locationCode: "SH MMC", note: "Dane testowe (SKIP_CIP_AUTH)", createTime: "2026-08-23 14:10:00" },
  { id: "test-6", itemNo: "FILLER-GRAY-1.6", itemName: "Filler GRAY 1.6mm", specifications: 60, locationCode: "SH 09", note: "Dane testowe (SKIP_CIP_AUTH)", createTime: "2026-08-24 10:30:00" },
];

// Called from this app's own server (Server Component), so - unlike a
// browser request - it isn't subject to CIP's CORS policy; the request
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
  const { records, error } =
    session?.token === BYPASS_TOKEN
      ? { records: TEST_RECORDS, error: false }
      : session
      ? await loadInventory(session.token)
      : { records: [], error: true };

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
