"use server";

import { ensureFreshCipSession } from "@/lib/cipSession";

// Server-side counterpart to wpsApi's POST /api/cip-orders/progress - the
// "Zamówienia → Postęp produkcji" screen. Same reason this is a Server
// Action rather than a browser fetch as lib/cipOrdersApi.js: the CIP bearer
// token lives in an httpOnly cookie and must never reach the browser, so the
// request has to be made from here.
//
// The pasted text goes over as-is and is parsed by wpsApi
// (src/productionProgress.js), so one tested parser serves every caller
// instead of this screen growing its own.
const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";
const API_TOKEN = process.env.API_TOKEN ?? "";

async function callProgress(text, token) {
  const res = await fetch(`${API_BASE_URL}/api/cip-orders/progress`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(API_TOKEN && { Authorization: `Bearer ${API_TOKEN}` }),
      "X-Cip-Token": token,
    },
    body: JSON.stringify({ text }),
    cache: "no-store",
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

/**
 * `{ rows, ordersQueried, positions }` for a pasted list - see wpsApi's
 * productionProgress.js for the row shape.
 *
 * Throws a plain Error whose message is meant to be shown as-is. A
 * "session_expired" reply (CIP refused this session's token - the proactive
 * expiry check in ensureFreshCipSession is only ever an estimate) forces one
 * refresh-and-retry before giving up, exactly as lib/cipOrdersApi.js does.
 */
export async function fetchProductionProgress(text) {
  const pasted = String(text ?? "").trim();
  if (!pasted) throw new Error("Wklej listę pozycji.");

  const session = await ensureFreshCipSession();
  if (!session) throw new Error("Brak sesji CIP - zaloguj się ponownie.");

  let reply = await callProgress(pasted, session.token);
  if (!reply.ok && reply.data?.code === "session_expired") {
    const retried = await ensureFreshCipSession({ force: true });
    if (!retried) throw new Error("Sesja CIP wygasła - zaloguj się ponownie.");
    reply = await callProgress(pasted, retried.token);
  }
  if (!reply.ok) throw new Error(reply.data?.error || `Błąd API (${reply.status})`);
  return reply.data;
}
