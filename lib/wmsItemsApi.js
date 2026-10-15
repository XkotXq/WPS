"use server";

import { api } from "@/lib/api";
import { getWmsSession } from "@/lib/wmsSession";

// Resolving item numbers against WMS's item master, for the issue-list grid.
//
// A Server Action because the WMS session lives in an httpOnly cookie and
// must not reach a `"use client"` file (see lib/wmsSession.js). The grid
// sends item numbers and gets back names; it never sees the session that
// fetched them.

/**
 * Look up every item number in `keywords` at once.
 *
 * Returns `{ items: { [keyword]: { item, matched, count } } }`, keyed by
 * **the number that was asked** so a reply can be matched to the row it
 * belongs to even when WMS found nothing. `matched` is `"exact"`, `"only"`,
 * `"ambiguous"` or `"none"` - see wpsApi's `matchWmsItem`; only the first
 * two carry an `item`, because filling an issue position with a material
 * nobody picked is how the wrong thing leaves the warehouse.
 *
 * Throws with `code: "wms_not_signed_in"` when there is no session and
 * `"wms_session_expired"` when WMS has dropped it - the screen asks for the
 * sign-in again rather than reporting every row as an unknown item.
 */
export async function lookupWmsItems(orgNo, keywords) {
  const session = await getWmsSession();
  if (!session) {
    const err = new Error("Zaloguj się do WMS.");
    err.code = "wms_not_signed_in";
    throw err;
  }

  const wanted = [...new Set((keywords ?? []).map((keyword) => String(keyword ?? "").trim()).filter(Boolean))];
  if (wanted.length === 0) return { items: {} };

  try {
    return await api.lookupWmsItems(session, { orgNo, keywords: wanted });
  } catch (err) {
    // lib/api.js throws a plain Error with `status`; carry the API's own
    // code across so the screen can tell a dead session from a bad item.
    if (err.status === 401) err.code = "wms_session_expired";
    throw err;
  }
}
