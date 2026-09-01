"use server";

import { ensureFreshCipSession } from "@/lib/cipSession";

const CIP_INVENTORY_URL = "http://10.96.9.2/wms/materialTemporaryStorageWarehouse/query/page";

// Same "itemNo alongside page" filter as fetchItemHistory (lib/cipHistory.js),
// just against the current-inventory endpoint instead of the history one -
// lets the export panel show whether a given FRP item already has a
// standing entry in CIP's temporary storage warehouse before you send
// another inStorage receipt for it.
export async function checkFrpImportStatus(itemNo) {
  const session = await ensureFreshCipSession();
  if (!session) return { checked: false, imported: false };

  try {
    const res = await fetch(CIP_INVENTORY_URL, {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "pl",
        authorization: `Bearer ${session.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        itemNo,
        page: { size: 1, current: 1, orders: [{ column: "createTime", asc: false }], pageSize: 1, pageSizes: [100, 200, 500] },
      }),
      cache: "no-store",
    });
    const json = await res.json();
    if (!res.ok || json.code !== 0) return { checked: false, imported: false };
    const record = json.data?.records?.[0] ?? null;
    return {
      checked: true,
      imported: Boolean(record),
      specifications: record?.specifications ?? null,
      locationCode: record?.locationCode ?? null,
    };
  } catch {
    return { checked: false, imported: false };
  }
}
