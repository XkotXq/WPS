// Server-side helper for talking to the standalone Express API in
// ../api (yfoc/api), not this Next.js app itself. Only used from Server
// Components/route handlers - reads plain (non-NEXT_PUBLIC) env vars, so
// it must not be imported into "use client" code.
const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";
const API_TOKEN = process.env.API_TOKEN ?? "";

// The Express API mounts every route under /api (see api/src/app.js:
// `app.use("/api", api)`) - every resource path below is relative to that.
async function apiFetch(path, { method = "GET", body, headers } = {}) {
  const res = await fetch(`${API_BASE_URL}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(API_TOKEN && { Authorization: `Bearer ${API_TOKEN}` }),
      // Per-call headers, for a route that needs the caller's **own**
      // session on top of this app's shared token - the WMS lookups below,
      // the same way the CIP routes take an X-Cip-Token. Only ever set from
      // server-side code; see lib/wmsItemsApi.js.
      ...headers,
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
    // Stock levels change from a device on the floor, not from this app
    // - never serve a stale cached response.
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
    // The API's own stable code, where it sends one: a caller often has to
    // tell apart two failures that share a status - a dead WMS session from
    // a document WMS would not take. The message stays the thing shown.
    if (data?.code) err.code = data.code;
    throw err;
  }
  return data;
}

export const api = {
  // Proxies to the old CIP system server-to-server (api/src/routes/auth.js)
  // - CIP has no browser CORS policy, so this can't be called from a
  // "use client" component directly (see /frp's cipAuth.js, which hits
  // this same route from a static app with no server of its own).
  loginCip: (username, password) => apiFetch("/auth/login", { method: "POST", body: { username, password } }),
  refreshCip: (refreshToken) => apiFetch("/auth/refresh", { method: "POST", body: { refreshToken } }),

  // WMS - the plant's own warehouse system, which is not CIP and has its own
  // accounts (wpsApi's src/wms.js). Proxied there for the same reason CIP's
  // login is: WMS sends no CORS headers, so no browser can call it. The
  // session that comes back goes into an httpOnly cookie, never into the
  // page - see lib/wmsAuthApi.js and lib/wmsSession.js.
  loginWms: (userNo, password) => apiFetch("/wms/login", { method: "POST", body: { userNo, password } }),

  // Resolves item numbers against WMS's own item master, as the signed-in
  // person - `session` is the wms_session cookie's contents, which is why
  // this is only ever reached through the Server Action in
  // lib/wmsItemsApi.js and never from the browser.
  lookupWmsItems: (session, { orgNo, keywords }) =>
    apiFetch("/wms/items", {
      method: "POST",
      body: { orgNo, keywords },
      headers: {
        ...(session?.cookie && { "X-Wms-Cookie": session.cookie }),
        ...(session?.token && { "X-Wms-Auth": session.token }),
      },
    }),

  // WMS's own lists for the issue-note header, each answering
  // { options: [{ code, name }] }: the organizations ("organizations" -
  // the one list WMS does not scope by an organization, since it is the
  // list of them), the warehouses behind both warehouse fields, the
  // classify types behind "Document class" and the picking rules. Same
  // session rule as above.
  listWmsReference: (session, kind, { orgNo }) =>
    apiFetch(`/wms/${kind}`, {
      method: "POST",
      body: { orgNo },
      headers: {
        ...(session?.cookie && { "X-Wms-Cookie": session.cookie }),
        ...(session?.token && { "X-Wms-Auth": session.token }),
      },
    }),

  // Creates the issue note in WMS. The **only** WMS call here that changes
  // anything - the positions are item numbers and quantities, and wpsApi
  // looks each one up again to build what WMS is actually sent.
  createWmsIssueNote: (session, { head, positions }) =>
    apiFetch("/wms/issue-notes", {
      method: "POST",
      body: { head, positions },
      headers: {
        ...(session?.cookie && { "X-Wms-Cookie": session.cookie }),
        ...(session?.token && { "X-Wms-Auth": session.token }),
      },
    }),

  // The issue notes WMS already holds, newest first - the read side of the
  // same screen. This is what its table shows, so a document raised on
  // WMS's own screen appears there too and a reload loses nothing.
  listWmsIssueNotes: (session, { orgNo, page, size } = {}) =>
    apiFetch("/wms/issue-notes/search", {
      method: "POST",
      body: { orgNo, page, size },
      headers: {
        ...(session?.cookie && { "X-Wms-Cookie": session.cookie }),
        ...(session?.token && { "X-Wms-Auth": session.token }),
      },
    }),

  listStockSessions: (limit = 20) => apiFetch(`/stocks?limit=${limit}`),
  getStockSession: (stocksId) => apiFetch(`/stocks/${stocksId}`),
  getSessionMaterialSnapshot: (stocksId, material) => apiFetch(`/stocks/${stocksId}/${material}`),
  getMaterialTrend: (material) => apiFetch(`/stocks/${material}/trend`),

  listCurrentItems: (material) => apiFetch(`/${material}`),
  createItem: (material, body) => apiFetch(`/${material}`, { method: "POST", body }),
  submitCheck: (material, body) => apiFetch(`/checks/${material}`, { method: "POST", body }),

  listCatalog: () => apiFetch("/catalog"),
  createCatalogEntry: (entry) => apiFetch("/catalog", { method: "POST", body: entry }),
  updateCatalogEntry: (number, entry) =>
    apiFetch(`/catalog/${encodeURIComponent(number)}`, { method: "PATCH", body: entry }),
  deleteCatalogEntry: (number) =>
    apiFetch(`/catalog/${encodeURIComponent(number)}`, { method: "DELETE" }),
};
