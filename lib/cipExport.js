"use server";

import { ensureFreshCipSession } from "@/lib/cipSession";

const CIP_IN_STORAGE_URL = "http://10.96.9.2/wms/materialTemporaryStorageWarehouse/inStorage";

// items = [{ itemNo, itemName, locationCode, note, specifications }] - one
// call per FRP row being received into CIP's temporary storage warehouse.
// itemNo/itemName come straight from frp_catalog (its item_number/name
// columns already use CIP's own item-master numbering - confirmed live,
// not guessed), locationCode is the drum/spool number, specifications is
// the row's length in km (matches what "Aktualna lista" shows). Runs
// sequentially (not Promise.all) so a mid-batch failure doesn't leave
// concurrent requests racing against the same session/token refresh, and
// so the per-item results stay in the same order the caller sent them in.
export async function exportFrpToCip(items) {
  const session = await ensureFreshCipSession();
  if (!session) {
    return { ok: false, results: items.map((item) => ({ itemNo: item.itemNo, ok: false, error: "Brak sesji CIP." })) };
  }

  const results = [];
  for (const item of items) {
    try {
      const res = await fetch(CIP_IN_STORAGE_URL, {
        method: "POST",
        headers: {
          accept: "application/json, text/plain, */*",
          "accept-language": "pl",
          authorization: `Bearer ${session.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          itemName: item.itemName,
          itemNo: item.itemNo,
          locationCode: item.locationCode,
          note: item.note ?? "",
          outStorageQuantity: "",
          signType: "add",
          specifications: String(item.specifications ?? ""),
        }),
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.code !== 0) {
        results.push({ itemNo: item.itemNo, ok: false, error: json?.msg || `Błąd CIP (${res.status})` });
      } else {
        results.push({ itemNo: item.itemNo, ok: true });
      }
    } catch {
      results.push({ itemNo: item.itemNo, ok: false, error: "Nie udało się połączyć z CIP." });
    }
  }

  return { ok: results.every((r) => r.ok), results };
}
