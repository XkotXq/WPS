"use server";

import { cookies } from "next/headers";
import { api } from "@/lib/api";

// httpOnly cookie so the CIP bearer token never reaches client-side JS -
// only Server Components/Actions read it, e.g. to call CIP endpoints
// (like the materials inventory query) directly from this app's own
// server, which - unlike a browser request - isn't subject to CIP's
// CORS policy.
const COOKIE_NAME = "cip_session";
const MAX_AGE_SECONDS = 60 * 60 * 24;
// Refresh a bit before the token actually expires so an in-flight page
// render never hits CIP with an already-dead token.
const REFRESH_SKEW_MS = 60_000;
// SKIP_CIP_AUTH=true skips validating credentials against CIP and accepts
// any username/password locally instead - for when CIP itself isn't
// reachable. Flip it back to false (or unset it) once CIP is reachable
// again to restore real login; no code changes needed. Pages that query
// CIP directly with the session token (e.g. materials-list) still need a
// real token, so they keep failing under the bypass - that's expected.
const SKIP_CIP_AUTH = process.env.SKIP_CIP_AUTH === "true";

function buildSession({ token, refreshToken, expiresIn, username, userId }) {
  return {
    token,
    refreshToken: refreshToken ?? null,
    // expiresIn is in seconds and may be absent - treat that as "unknown",
    // not "already expired".
    expiresAt: Number.isFinite(expiresIn) ? Date.now() + expiresIn * 1000 : null,
    username,
    userId: userId ?? null,
    loggedInAt: Date.now(),
  };
}

async function persist(session) {
  const store = await cookies();
  store.set(COOKIE_NAME, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function loginCip(username, password) {
  if (!username?.trim() || !password) {
    throw new Error("Podaj login i hasło.");
  }
  if (SKIP_CIP_AUTH) {
    const session = buildSession({ token: "local-bypass", username: username.trim() });
    await persist(session);
    return { username: session.username, userId: session.userId };
  }
  const data = await api.loginCip(username, password);
  const session = buildSession({ ...data, username: data.name || username });
  await persist(session);
  return { username: session.username, userId: session.userId };
}

export async function logoutCip() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getCipSession() {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Call this instead of getCipSession() anywhere the result is about to be
// used to call CIP - transparently refreshes the token first if it's
// expired or close to it (using the refresh_token from login), and
// re-persists the updated session in the cookie. Returns null if there's
// no session, or if refreshing failed (refresh_token itself expired/
// revoked - the only recovery from that is a fresh login).
export async function ensureFreshCipSession() {
  const session = await getCipSession();
  if (!session) return null;

  const needsRefresh = session.expiresAt !== null && Date.now() > session.expiresAt - REFRESH_SKEW_MS;
  if (!needsRefresh) return session;
  if (!session.refreshToken) return session; // nothing to refresh with - let the CIP call itself fail/report

  try {
    const data = await api.refreshCip(session.refreshToken);
    const refreshed = buildSession({
      token: data.token,
      refreshToken: data.refreshToken,
      expiresIn: data.expiresIn,
      username: data.name || session.username,
      userId: data.userId ?? session.userId,
    });
    await persist(refreshed);
    return refreshed;
  } catch {
    // Refresh token expired/revoked - caller sees the stale session and
    // its next CIP call will 401; only a fresh login recovers from this.
    return session;
  }
}
