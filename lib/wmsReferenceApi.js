"use server";

import { api } from "@/lib/api";
import { getWmsSession } from "@/lib/wmsSession";

// WMS's own lists for the issue-note header: the organizations behind both
// organization fields, the warehouses behind both warehouse fields, the
// classify types behind "Document class" and the picking rules behind
// "Picking rule".
//
// Server Actions for the same reason lib/wmsItemsApi.js is one: the WMS
// session lives in an httpOnly cookie and must not reach a `"use client"`
// file (see lib/wmsSession.js). The form asks for an organization's list and
// gets back codes and names, never the session.

/**
 * One list as `{ options: [{ code, name }] }`, in WMS's own order.
 *
 * Throws with `code: "wms_not_signed_in"` when there is no session and
 * `"wms_session_expired"` when WMS has dropped it. Those stay apart on
 * purpose: an empty select and a lost session look identical on screen, and
 * only one of them is fixed by signing in again.
 */
async function listReference(kind, orgNo, { scoped = true } = {}) {
  const session = await getWmsSession();
  if (!session) {
    const err = new Error("Zaloguj się do WMS.");
    err.code = "wms_not_signed_in";
    throw err;
  }

  const org = String(orgNo ?? "").trim();
  // An unscoped list is fetched whatever the organization is, because it
  // is the list of organizations - returning nothing for a blank one
  // would empty the very field that supplies one.
  if (scoped && !org) return { options: [] };

  try {
    return await api.listWmsReference(session, kind, { orgNo: scoped ? org : "" });
  } catch (err) {
    if (err.status === 401) err.code = "wms_session_expired";
    throw err;
  }
}

// Each list is its own export rather than one function taking a path from the
// client: a Server Action is callable from the browser by anything that can
// reach the page, so what it may ask WMS for is fixed here.

// Takes no organization at all - see listReference's own note.
export async function listWmsOrganizations() {
  return listReference("organizations", "", { scoped: false });
}

export async function listWmsWarehouses(orgNo) {
  return listReference("warehouses", orgNo);
}

export async function listWmsDocumentClasses(orgNo) {
  return listReference("document-classes", orgNo);
}

export async function listWmsPickRules(orgNo) {
  return listReference("pick-rules", orgNo);
}
