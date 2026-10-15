import { cookies } from "next/headers";

// The WMS session, in an httpOnly cookie of its own - **not** a Server
// Action module, deliberately.
//
// WMS is the plant's own warehouse system and a separate login from CIP's:
// the person at the desk is already signed into wps with their CIP account,
// and WMS does not know it. Both sessions therefore exist side by side,
// `cip_session` and `wms_session`, and neither one logs the other in or out.
//
// Everything here runs server-side only, and nothing here is exported to the
// browser: the WMS token is what creates a list in WMS, so it must never
// reach a "use client" file the way `cip_session`'s token can (getCipSession
// is a Server Action, so anything rendered in the browser may call it and
// read the CIP token back). What the screen is allowed to know is
// `wmsSessionInfo()` - a name and nothing else. The actions the browser does
// call live in lib/wmsAuthApi.js, which is the only file that writes this
// cookie.
const COOKIE_NAME = "wms_session";

// A shift, so the cookie is never what ends the session. WMS decides that
// for itself and may well drop a session sooner (these frameworks often idle
// out in half an hour); there is nothing to refresh it with, so the first
// call WMS refuses is what says so, and the answer is to sign in again.
const MAX_AGE_SECONDS = 60 * 60 * 8;

export async function persistWmsSession(session) {
  const store = await cookies();
  store.set(COOKIE_NAME, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearWmsSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/**
 * The whole session, token and all - for server code that is about to call
 * WMS with it. `null` when nobody has signed in.
 */
export async function getWmsSession() {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * What a screen may know about the session: who is signed in, and when.
 * Never the token or the cookie WMS recognises them by - this is the shape
 * that crosses into the browser (see app/dashboard/orders/wms/page.js).
 */
export async function wmsSessionInfo() {
  const session = await getWmsSession();
  if (!session) return null;
  return {
    userNo: session.userNo ?? null,
    name: session.name ?? session.userNo ?? null,
    signedInAt: session.signedInAt ?? null,
  };
}
