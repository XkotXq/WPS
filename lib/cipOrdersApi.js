"use server";

import { ensureFreshCipSession } from "@/lib/cipSession";

// Server-side counterpart to wpsApi's POST /api/cip-orders/materials/warehouse
// (see wpsApi's AGENTS.md/src/cip.js) - the "Zamówienia" tab's search, and
// "Zamówienie materiału"'s own order-scoped material picker. Same reason
// this is a Server Action and not a plain client-side fetch as
// lib/smItemsCipApi.js: the CIP bearer token lives in an httpOnly cookie and
// must never reach the browser, so the request has to be made from here.
//
// POST with `orderId` in the JSON body, not a GET with it in the URL - it
// can contain "(" ")" (a full orderId like "260010309034801(4)") and, since
// wpsApi now also resolves a bare fragment/suffix of the number (e.g. just
// "9034801"), potentially other odd substrings too. A body sidesteps
// URL-encoding all of that correctly at every call site.
const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";
const API_TOKEN = process.env.API_TOKEN ?? "";

// Returns the shape wpsApi's own endpoint returns: a single { orderId,
// materials } when `orderId` matched exactly one CIP order line, or an array
// of those (one per line) when it was a bare order number/fragment matching
// several - see that route's own comment for why. Throws a plain Error with
// a message meant to be shown to the operator as-is (ApiError's own
// message, or a generic one for a network/unexpected failure).
export async function searchCipOrderMaterials(orderId) {
  const trimmed = String(orderId ?? "").trim();
  if (!trimmed) throw new Error("Podaj numer zamówienia.");

  const session = await ensureFreshCipSession();
  if (!session) throw new Error("Brak sesji CIP - zaloguj się ponownie.");

  const res = await fetch(`${API_BASE_URL}/api/cip-orders/materials/warehouse`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(API_TOKEN && { Authorization: `Bearer ${API_TOKEN}` }),
      "X-Cip-Token": session.token,
    },
    body: JSON.stringify({ orderId: trimmed }),
    cache: "no-store",
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) throw new Error(data?.error || `Błąd API (${res.status})`);
  return data;
}
