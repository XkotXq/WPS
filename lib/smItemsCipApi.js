"use server";

import { ensureFreshCipSession } from "@/lib/cipSession";

// Server-side only counterpart to lib/smItemsApi.js's plain client-side
// upsert - a Server Action, so it can be called directly from "use client"
// code (SmMaterialsPanel.js) the same way lib/cipSession.js's own actions
// are, without a hand-rolled app/api route (this app has none - see
// lib/api.js/cipSession.js for the existing Server Action convention).
//
// Exists for one reason: the CIP bearer token lives in an httpOnly cookie
// and, by cipSession.js's own design, must never reach the browser. A
// receipt/issue write that wpsApi needs to check against CIP (see wpsApi's
// src/cip.js) has to carry that token - so *that* write goes through here
// (server-to-server) instead of the client-side path every other sm_items
// write still uses.
const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";
const API_TOKEN = process.env.API_TOKEN ?? "";

// `cip`, when given: { operation: "receipt" | "issue", quantity } - this
// write's own delta (what's actually being received/issued right now, not
// the item's new total; the caller already knows this, see
// SmMaterialsPanel's cipTasksFor* helpers). Omit it entirely for a write
// that has nothing to do with CIP (e.g. renaming a location) - behaves
// exactly like lib/smItemsApi.js's own upsert then, no CIP token sent.
export async function upsertSmItemViaCip(item, cip) {
  const session = cip ? await ensureFreshCipSession() : null;
  if (cip && !session) throw new Error("Brak sesji CIP - zaloguj się ponownie.");

  const res = await fetch(`${API_BASE_URL}/api/sm-items/${encodeURIComponent(item.itemNo)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(API_TOKEN && { Authorization: `Bearer ${API_TOKEN}` }),
      ...(session && { "X-Cip-Token": session.token }),
    },
    body: JSON.stringify(cip ? { ...item, cipOperation: cip.operation, cipQuantity: cip.quantity } : item),
    cache: "no-store",
  });
  let data = null;
  try {
    data = res.status === 204 ? null : await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) throw new Error(data?.error || `Błąd API (${res.status})`);
  return data;
}
