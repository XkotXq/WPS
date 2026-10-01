"use client";

import { apiFetch } from "@/lib/smCatalogApi";

// Backs wpsapi's login_events (see its schema.sql) - "Historia logowania"
// under Zamówienia/Transporty: which physical forklift ("wózek") a login
// happened on, written by wpsapi's own POST /auth/login whenever the caller
// (smpda) sent a deviceLabel - a wps/stock browser login never does, so
// this list is smpda logins only, by construction. Same direct-to-wpsapi,
// client-side pattern as lineMaterialRulesApi.js/smCatalogApi.js (this
// file's own `apiFetch`), reused rather than duplicated. Read-only - there
// is nothing to create/edit here from wps, only wpsapi's own login route
// ever writes a row.
export const loginEventsApi = {
  list: () => apiFetch("/login-events"),
};
