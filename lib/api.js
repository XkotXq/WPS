// Server-side helper for talking to the standalone Express API in
// ../api (yfoc/api), not this Next.js app itself. Only used from Server
// Components/route handlers — reads plain (non-NEXT_PUBLIC) env vars, so
// it must not be imported into "use client" code.
const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";
const API_TOKEN = process.env.API_TOKEN ?? "";

// The Express API mounts every route under /api (see api/src/app.js:
// `app.use("/api", api)`) — every resource path below is relative to that.
async function apiFetch(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API_BASE_URL}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(API_TOKEN && { Authorization: `Bearer ${API_TOKEN}` }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
    // Stock levels change from a device on the floor, not from this app
    // — never serve a stale cached response.
    cache: "no-store",
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

export const api = {
  // Proxies to the old CIP system server-to-server (api/src/routes/auth.js)
  // — CIP has no browser CORS policy, so this can't be called from a
  // "use client" component directly (see /frp's cipAuth.js, which hits
  // this same route from a static app with no server of its own).
  loginCip: (username, password) => apiFetch("/auth/login", { method: "POST", body: { username, password } }),
  refreshCip: (refreshToken) => apiFetch("/auth/refresh", { method: "POST", body: { refreshToken } }),

  listStockSessions: (limit = 20) => apiFetch(`/stocks?limit=${limit}`),
  getStockSession: (stocksId) => apiFetch(`/stocks/${stocksId}`),
  getSessionMaterialSnapshot: (stocksId, material) => apiFetch(`/stocks/${stocksId}/${material}`),
  getMaterialTrend: (material) => apiFetch(`/stocks/${material}/trend`),

  listCurrentItems: (material) => apiFetch(`/${material}`),
  submitCheck: (material, body) => apiFetch(`/checks/${material}`, { method: "POST", body }),

  listCatalog: () => apiFetch("/catalog"),
  createCatalogEntry: (entry) => apiFetch("/catalog", { method: "POST", body: entry }),
  updateCatalogEntry: (number, entry) =>
    apiFetch(`/catalog/${encodeURIComponent(number)}`, { method: "PATCH", body: entry }),
  deleteCatalogEntry: (number) =>
    apiFetch(`/catalog/${encodeURIComponent(number)}`, { method: "DELETE" }),
};
