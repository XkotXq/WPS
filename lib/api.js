// Server-side helper for talking to the standalone Express API in
// ../api (yfoc/api), not this Next.js app itself. Only used from Server
// Components/route handlers — reads plain (non-NEXT_PUBLIC) env vars, so
// it must not be imported into "use client" code.
const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";
const API_TOKEN = process.env.API_TOKEN ?? "";

async function apiFetch(path) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(API_TOKEN && { Authorization: `Bearer ${API_TOKEN}` }),
    },
    // Stock levels change from a device on the floor, not from this app
    // — never serve a stale cached response.
    cache: "no-store",
  });
  let data = null;
  try {
    data = await res.json();
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

export const api = {
  listStockSessions: (limit = 20) => apiFetch(`/stocks?limit=${limit}`),
  getStockSession: (stocksId) => apiFetch(`/stocks/${stocksId}`),
  getSessionMaterialSnapshot: (stocksId, material) => apiFetch(`/stocks/${stocksId}/${material}`),
};
