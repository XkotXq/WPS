"use server";

import { api } from "@/lib/api";
import { clearWmsSession, persistWmsSession } from "@/lib/wmsSession";

// Signing in and out of WMS, from the "Wydania WMS" screen.
//
// A Server Action for the same reason lib/cipOrdersApi.js is one: the
// credentials and the session that comes back must not pass through the
// page's own JavaScript. The password goes from the form straight to this
// action, this app's server hands it to wpsApi, wpsApi hands it to WMS
// (which, like CIP, has no CORS policy a browser could satisfy), and what
// comes back is written into an httpOnly cookie here. **Only the name is
// returned** - the token stays on the server.
//
// Nothing is remembered between sessions: no "remember me", no stored
// password. Somebody who closes their browser signs in again.

export async function signInToWms(userNo, password) {
  const user = String(userNo ?? "").trim();
  if (!user || !password) throw new Error("Podaj login i hasło do WMS.");

  const session = await api.loginWms(user, password);
  await persistWmsSession({
    // Either of these identifies the session and WMS decides which (see
    // wpsApi's src/wms.js) - both are kept and neither is read here.
    token: session.token ?? null,
    cookie: session.cookie ?? null,
    userNo: session.userNo ?? user,
    name: session.name ?? user,
    signedInAt: Date.now(),
  });

  return { userNo: session.userNo ?? user, name: session.name ?? user };
}

// Signs out of WMS **only** - the CIP session this screen was reached with
// is untouched, so this never throws the person out of wps itself.
export async function signOutOfWms() {
  await clearWmsSession();
}
