"use client";

// Where the **browser** reaches wpsApi and Hasura from.
//
// Both used to be a hostname somebody typed into `.env.local`, and both
// defaulted to localhost - which is correct only when the browser and the
// server are the same machine. Opened from a phone on the LAN the page
// loaded fine (its HTML comes from this app's own server) and then every
// client-side screen failed, because "localhost:4000" on a phone is the
// phone: "Nie udało się pobrać listy z API" on Materiały SM, 2026-10-12.
//
// So the default is now **derived from the page's own address**: whatever
// host this page was loaded from, the API is on :4000 of that same host and
// Hasura on :8080. One machine's address is therefore nowhere in the source
// or in `.env.local`, which is also what makes the whole thing run on
// another computer with no edit at all (see the repo's SETUP.md).
//
// An explicit `NEXT_PUBLIC_API_BASE_URL` / `NEXT_PUBLIC_HASURA_WS_URL`
// still wins, because the deployed stack needs exactly that: there the
// browser's address and the server's are genuinely different hosts (see
// ../deploy/README.md). Only the port is separately overridable, for a
// setup that keeps the same host but moves a port.
const API_PORT = process.env.NEXT_PUBLIC_API_PORT || "4000";
const HASURA_PORT = process.env.NEXT_PUBLIC_HASURA_PORT || "8080";

// Not a module constant: these files are "use client" but still execute
// during server rendering, where `window` does not exist. Reading the
// address per call means the browser's own answer is used in the browser
// and the server's fallback on the server, instead of whichever
// environment happened to load the module first.
function originOr(fallbackHost) {
  if (typeof window === "undefined") return null;
  return { protocol: window.location.protocol, host: window.location.hostname || fallbackHost };
}

/** `http://<this page's host>:4000`, or whatever NEXT_PUBLIC_API_BASE_URL says. */
export function apiBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const here = originOr("localhost");
  if (!here) return `http://localhost:${API_PORT}`;
  return `${here.protocol}//${here.host}:${API_PORT}`;
}

/** `ws://<this page's host>:8080/v1/graphql`, or NEXT_PUBLIC_HASURA_WS_URL. */
export function hasuraWsUrl() {
  const explicit = process.env.NEXT_PUBLIC_HASURA_WS_URL;
  if (explicit) return explicit;
  const here = originOr("localhost");
  if (!here) return `ws://localhost:${HASURA_PORT}/v1/graphql`;
  // wss when the page itself is https, so a secured deployment does not
  // open an insecure socket the browser would block anyway.
  const scheme = here.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${here.host}:${HASURA_PORT}/v1/graphql`;
}
