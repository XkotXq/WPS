"use client";

// Talks directly to wpsapi from the browser, same pattern as
// lib/smCatalogApi.js - see that file's own comment for why (this is a
// "use client" component tree, lib/api.js is server-only).
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
const API_TOKEN = process.env.NEXT_PUBLIC_API_TOKEN || "";

async function apiFetch(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API_BASE_URL}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(API_TOKEN && { Authorization: `Bearer ${API_TOKEN}` }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  let data = null;
  try {
    data = res.status === 204 ? null : await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Błąd API (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Backs sm_items/sm_units (see wpsapi's schema.sql) - Lista materiałów SM's
// current stock. `upsert` always sends the *whole* item (item fields +
// every unit) and the server replaces that item's units wholesale - see
// SmMaterialsPanel's setItems wrapper, which is what calls this after
// every mutation.
export const smItemsApi = {
  list: () => apiFetch("/sm-items"),
  upsert: (item) => apiFetch(`/sm-items/${encodeURIComponent(item.itemNo)}`, { method: "PUT", body: item }),
  remove: (itemNo) => apiFetch(`/sm-items/${encodeURIComponent(itemNo)}`, { method: "DELETE" }),
};

// Backs sm_operations - Historia operacji SM. `list` is one page at a time
// (server caps `limit` at 500 regardless) - returns { rows, total } so the
// page can tell whether a next page actually exists.
export const smOperationsApi = {
  list: (limit, offset) => {
    const params = new URLSearchParams();
    if (limit) params.set("limit", limit);
    if (offset) params.set("offset", offset);
    const query = params.toString();
    return apiFetch(`/sm-operations${query ? `?${query}` : ""}`);
  },
  create: (entries) => apiFetch("/sm-operations", { method: "POST", body: { entries } }),
  // One item's full history, oldest first, unpaginated - powers the "Stan
  // w czasie" chart (SmMaterialStockChart.js) via SmMaterialsPanel.
  history: (itemNo) => apiFetch(`/sm-operations/item/${encodeURIComponent(itemNo)}`),
};
