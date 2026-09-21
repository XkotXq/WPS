"use client";

import { apiFetch } from "./smCatalogApi";

// Spool-number series for smpda's FRP module - see wpsapi's src/smSpools.js.
export const smSpoolsApi = {
  getSettings: () => apiFetch("/sm-spools/settings"),
  saveSettings: (series) => apiFetch("/sm-spools/settings", { method: "PUT", body: { series } }),
  // The number the next spool would get (reserves nothing).
  next: () => apiFetch("/sm-spools/next"),
};
