"use client";

// Talks directly to the standalone Express API (../wpsapi) from the
// browser, entirely client-side - same NEXT_PUBLIC_API_BASE_URL/
// NEXT_PUBLIC_API_TOKEN pattern ../stock/src/lib/checkApi.js already
// uses, needed here because SmMaterialsCatalogTable.js is a "use client"
// component (lib/api.js is server-only, see its own comment).
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

// Backs sm_catalog (see wpsapi's schema.sql) - the reference list of
// every known "Materiały SM" material, replacing the old localStorage-only
// SM_CATALOG_STORAGE_KEY.
export const smCatalogApi = {
  list: () => apiFetch("/sm-catalog"),
  create: (entry) => apiFetch("/sm-catalog", { method: "POST", body: entry }),
  update: (itemNo, entry) => apiFetch(`/sm-catalog/${encodeURIComponent(itemNo)}`, { method: "PATCH", body: entry }),
  remove: (itemNo) => apiFetch(`/sm-catalog/${encodeURIComponent(itemNo)}`, { method: "DELETE" }),
};
