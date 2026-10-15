"use server";

import { cipSessionOrLogin } from "@/lib/cipSession";

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

async function callProgress(text, packageSizes, token) {
  const res = await fetch(`${API_BASE_URL}/api/cip-orders/progress`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(API_TOKEN && { Authorization: `Bearer ${API_TOKEN}` }),
      "X-Cip-Token": token,
    },
    body: JSON.stringify({ text, packageSizes }),
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
 * `packageSizes` is `{ "<itemNo>": <number> }`: how much one roll/bigbag of
 * that exact material holds, where the operator has said it differs from the
 * default. Only the size travels - how a package is counted stays in wpsApi
 * (`PACKAGE_RULES`), which also drops anything unusable rather than
 * refusing the answer, so nothing here has to validate it.
 *
 * Throws a plain Error whose message is meant to be shown as-is. A
 * "session_expired" reply (CIP refused this session's token - the proactive
 * expiry check in ensureFreshCipSession is only ever an estimate) forces one
 * refresh-and-retry before giving up, exactly as lib/cipOrdersApi.js does.
 * When that refresh fails too there is no session left to retry with, so
 * cipSessionOrLogin() sends the operator to the login page instead of
 * returning here with an error nobody can act on.
 */
export async function fetchProductionProgress(text, packageSizes) {
  const pasted = String(text ?? "").trim();
  if (!pasted) throw new Error("Wklej listę pozycji.");

  const session = await cipSessionOrLogin();

  let reply = await callProgress(pasted, packageSizes, session.token);
  if (!reply.ok && reply.data?.code === "session_expired") {
    const retried = await cipSessionOrLogin({ force: true });
    reply = await callProgress(pasted, packageSizes, retried.token);
  }
  if (!reply.ok) throw new Error(reply.data?.error || `Błąd API (${reply.status})`);
  return reply.data;
}
