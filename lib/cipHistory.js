"use server";

import { ensureFreshCipSession } from "@/lib/cipSession";

const CIP_HISTORY_URL = "http://10.96.9.2/wms/materialTemporaryStorageWarehouseHistory/query/page";

// Called from a client component (CipMaterialsHistoryTable) as a Server
// Action when a row is clicked, so it isn't subject to CIP's CORS policy
// either - same reasoning as the page-level fetches in
// materials-list/page.js and materials-list/history/page.js. Unlike those,
// this filters by itemNo (a top-level sibling of `page`, not nested in it -
// captured live from CIP's own "history" action for a single item), so it
// gets that item's full history instead of being capped by whatever falls
// inside the global top-500-across-all-items page.
export async function fetchItemHistory(itemNo) {
  const session = await ensureFreshCipSession();
  if (!session) return { records: [], error: true };

  try {
    const res = await fetch(CIP_HISTORY_URL, {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "pl",
        authorization: `Bearer ${session.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        itemNo,
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
