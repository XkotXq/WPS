"use client";

import { apiFetch } from "@/lib/smCatalogApi";

// Backs wpsapi's orders/order_items (see its schema.sql + AGENTS.md
// "Transport orders") - "Lista zamówień"/"Historia zamówień" in
// OrdersCipListTable.js. Same direct-to-wpsapi, client-side pattern as
// lineMaterialRulesApi.js/smCatalogApi.js (this file's own `apiFetch`) -
// orders never touch CIP, so unlike lib/cipOrdersApi.js this needs no
// Server Action/httpOnly cookie hop.
export const ordersApi = {
  // scope: "active" (new + in_progress, "Lista zamówień") | "history"
  // (done + cancelled, "Historia zamówień") - see wpsapi's listOrders.
  list: (scope) => apiFetch(`/orders?scope=${encodeURIComponent(scope)}`),
  // Every known place (fixed lines + whatever was typed on an earlier
  // goods_transport order) - the free-text "skąd"/"dokąd" suggestion pool,
  // straight from the database's own `locations` table instead of derived
  // from whatever orders happen to be loaded client-side.
  locations: () => apiFetch("/orders/locations"),
  // "Transporty → Raporty" - one period's work split by shift and by the
  // operator who delivered it (see wpsapi's orderReports.js). Dates are
  // plant-local and inclusive at both ends.
  shiftReport: (from, to) =>
    apiFetch(`/orders/reports/shifts?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  create: (order) => apiFetch("/orders", { method: "POST", body: order }),
  take: (id, takenBy) => apiFetch(`/orders/${encodeURIComponent(id)}/take`, { method: "POST", body: { takenBy } }),
  complete: (id, completedBy) => apiFetch(`/orders/${encodeURIComponent(id)}/complete`, { method: "POST", body: { completedBy } }),
  cancel: (id, reason) => apiFetch(`/orders/${encodeURIComponent(id)}/cancel`, { method: "POST", body: { reason } }),
  // The requester's "Zgadza się" on a `delivered` order - delivered -> done
  // (see wpsapi's acceptOrder).
  accept: (id, acceptedBy) => apiFetch(`/orders/${encodeURIComponent(id)}/accept`, { method: "POST", body: { acceptedBy } }),
  // The requester's "Problem rozwiązany" on a `problem` row -
  // problem -> in_progress, so the forklift operator can carry on (see
  // wpsapi's resolveOrderProblem). Reporting the problem itself happens in
  // smVendor, on the operator's own phone, never here.
  // "Zgłoś problem" on a `delivered` order - delivered -> **problem**, not
  // cancelled (see wpsapi's reportOrderProblem). It used to reuse `cancel`,
  // which ended the transport and left nobody to answer; now the delivery is
  // undone and the forklift operator has to put it right and mark it
  // corrected in smVendor before delivering again. A description is
  // required, server-side too.
  reportProblem: (id, reportedBy, note) =>
    apiFetch(`/orders/${encodeURIComponent(id)}/problem`, { method: "POST", body: { reportedBy, note } }),
  resolveProblem: (id, resolvedBy) =>
    apiFetch(`/orders/${encodeURIComponent(id)}/problem/resolve`, { method: "POST", body: { resolvedBy } }),
  // Everything that ever happened to one order, oldest first (wpsapi's
  // order_events, written by the status triggers). This is the only way to
  // read back an episode that has since moved on - the order row itself
  // holds just the current state, so a problem the forklift operator
  // reported and the requester then resolved leaves no other trace. Fetched
  // per row, on expand, rather than with the list: it is detail nobody
  // needs for every row at once.
  events: (id) => apiFetch(`/orders/${encodeURIComponent(id)}/events`),
};
