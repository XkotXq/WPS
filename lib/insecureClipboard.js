"use client";

// Lets copy/paste work in the data grids when this dashboard is opened over
// plain HTTP - which is how it is reached on the warehouse LAN
// (http://10.96.12.204:3000), since there is no TLS yet (see
// deploy/README.md).
//
// **The problem.** `navigator.clipboard` only exists in a secure context, so
// over HTTP it is `undefined`. glide-data-grid's paste handler opens with
//
//     if (navigator.clipboard.read !== undefined) { ... }
//
// with no `?.`, so reading that property throws before anything else runs:
// "Cannot read properties of undefined (reading 'read')" - on a whole pasted
// list and on a single cell alike. Its copy path is written defensively
// (`navigator.clipboard?.write`) and was never affected.
//
// **Why this fixes it.** Three lines further down that same handler already
// falls back to the paste event's own `e.clipboardData`, which needs no API
// and works in any context - it simply never got there. Giving
// `navigator.clipboard` an object with no `read`/`readText` lets both
// guards come back undefined and the library take its own intended path,
// using its own parsing (tab-separated columns, text/html, the lot) rather
// than a second copy of it written here.
//
// `writeText` is a no-op rather than absent: the copy path can reach
// `navigator.clipboard?.writeText(s)` in its own catch branch, where an
// object without the method would throw where today's `undefined`
// harmlessly short-circuits. Nothing else is added - in particular no
// `write`, so copy keeps choosing its `e.clipboardData` branch exactly as
// it does now.
//
// Real clipboard objects are never touched. Delete this module once the
// dashboard is served over HTTPS.
export function installInsecureClipboardFallback() {
  if (typeof window === "undefined") return;
  if (window.navigator.clipboard !== undefined) return;

  try {
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText: async () => {} },
      configurable: true,
    });
  } catch {
    // A browser that refuses the definition keeps the old behaviour: paste
    // stays broken there, but nothing else is, and this must never be the
    // reason a page fails to render.
  }
}
