import { getTranslations } from "next-intl/server";
import { ensureFreshCipSession } from "@/lib/cipSession";
import CipMaterialsHistoryTable from "@/components/CipMaterialsHistoryTable";

const CIP_HISTORY_URL = "http://10.96.9.2/wms/materialTemporaryStorageWarehouseHistory/query/page";
const PAGE_SIZE = 500;
// Every one of these is a real top-level field on a history record
// (captured live: itemNo, itemName, handleByAfter, ...) - CIP's own query
// endpoint accepts them as siblings of `page` and filters server-side, so
// this isn't limited to whatever the current 500-row page happens to hold.
const FILTER_KEYS = ["itemNo", "itemName", "operation", "handleByAfter", "locationCodeAfter"];

// Same server-side-fetch pattern as ../page.js (materials-list/page.js) -
// captured from the page at
// http://10.96.9.2/#/materialManage/rawMaterialInOut/inventory/index
// (the "history" action on a row there).
async function loadHistory(token, page, filters) {
  try {
    const res = await fetch(CIP_HISTORY_URL, {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "pl",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ...filters,
        page: { size: PAGE_SIZE, current: page, orders: [{ column: "createTime", asc: false }], pageSize: PAGE_SIZE, pageSizes: [100, 200, 500] },
      }),
      cache: "no-store",
    });
    const json = await res.json();
    if (!res.ok || json.code !== 0) throw new Error(json?.msg || `Błąd CIP (${res.status})`);
    return {
      records: json.data?.records ?? [],
      totalPages: json.data?.pages ?? 1,
      total: json.data?.total ?? 0,
      error: false,
    };
  } catch {
    return { records: [], totalPages: 1, total: 0, error: true };
  }
}

export default async function MaterialsHistoryPage({ searchParams }) {
  const params = await searchParams;
  const t = await getTranslations("materialsHistory");
  const session = await ensureFreshCipSession();
  const requestedPage = Math.max(1, Number.parseInt(params?.page, 10) || 1);
  const filters = Object.fromEntries(
    FILTER_KEYS.map((key) => [key, String(params?.[key] ?? "").trim()]).filter(([, value]) => value !== "")
  );
  const { records, totalPages, total, error } = session
    ? await loadHistory(session.token, requestedPage, filters)
    : { records: [], totalPages: 1, total: 0, error: true };
  const currentPage = Math.min(requestedPage, Math.max(totalPages, 1));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-navy-950 dark:text-white">{t("title")}</h1>
        {error && <span className="text-xs font-medium text-red-600 dark:text-red-400">{t("fetchError")}</span>}
      </div>
      <p className="mt-2 text-sm text-gray-500 dark:text-neutral-400">{t("subtitle")}</p>

      <div className="mt-6">
        <CipMaterialsHistoryTable
          records={records}
          currentPage={currentPage}
          totalPages={totalPages}
          total={total}
          filters={filters}
        />
      </div>
    </div>
  );
}
