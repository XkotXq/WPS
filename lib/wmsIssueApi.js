"use server";

import { api } from "@/lib/api";
import { getWmsSession } from "@/lib/wmsSession";

// Creating the issue note in WMS - the one thing this screen does that is not
// a read, which is why it is its own module rather than another export of
// lib/wmsItemsApi.js.
//
// A Server Action for the reason the others are: the WMS session lives in an
// httpOnly cookie and must not reach a `"use client"` file.

/**
 * Send the list to WMS.
 *
 * `head` is the form's own fields and `positions` are
 * `[{ itemNo, quantity, location }]` - **item numbers, not materials**.
 * wpsApi resolves every one against WMS's item master again and sends back
 * WMS's own item rows, so what the document carries cannot have drifted from
 * what WMS has (see its AGENTS.md).
 *
 * Returns `{ outNoticeNo, positions }`. Throws with:
 *   `wms_not_signed_in`         no session here
 *   `wms_session_expired`       WMS dropped it
 *   `wms_unknown_items`         an item number WMS does not recognise
 *   `wms_rejected`              WMS refused the document, with its own words
 * A refusal is never reported as a save: a list believed saved when it was
 * not is the one outcome nobody can recover from.
 */
export async function createWmsIssueNote(head, positions) {
  const session = await getWmsSession();
  if (!session) {
    const err = new Error("Zaloguj się do WMS.");
    err.code = "wms_not_signed_in";
    throw err;
  }

  try {
    return await api.createWmsIssueNote(session, {
      head,
      positions: (positions ?? []).map((row) => ({
        itemNo: String(row.itemNo ?? "").trim(),
        quantity: String(row.quantity ?? "").trim(),
        location: String(row.location ?? "").trim(),
      })),
    });
  } catch (err) {
    // lib/api.js throws a plain Error with `status` and the API's own body
    // behind it; carry the code across so the screen can tell a dead session
    // from a document WMS would not take.
    if (err.status === 401) err.code = "wms_session_expired";
    throw err;
  }
}

/**
 * The issue notes WMS already holds, newest first.
 *
 * The read side of this screen, and the reason its table needs no storage
 * of its own: what is shown is **WMS's list**, so a document raised on
 * WMS's own screen is on it too and a reload loses nothing.
 *
 * Throws `wms_not_signed_in` with no session and `wms_session_expired`
 * when WMS has dropped one - the table has to tell those apart, since one
 * of them is fixed by signing in and the other looks like an empty table.
 */
export async function listWmsIssueNotes({ orgNo = "", page, size } = {}) {
  const session = await getWmsSession();
  if (!session) {
    const err = new Error("Zaloguj się do WMS.");
    err.code = "wms_not_signed_in";
    throw err;
  }

  try {
    return await api.listWmsIssueNotes(session, { orgNo, page, size });
  } catch (err) {
    if (err.status === 401) err.code = "wms_session_expired";
    throw err;
  }
}
