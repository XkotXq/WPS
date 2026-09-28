"use client";

import { apiFetch } from "@/lib/smCatalogApi";

// Backs line_material_rules (see wpsapi's schema.sql) - "Wytyczne do
// transportów"'s own standing instructions, one per (line, material), e.g.
// "SH02 + Glass Yarn/600tex -> krótkie odcinki". Same direct-to-wpsapi,
// client-side pattern as smCatalogApi.js (this file's own `apiFetch`),
// reused rather than duplicated.
export const lineMaterialRulesApi = {
  list: () => apiFetch("/line-material-rules"),
  // The line picker's own options - straight from the database's own
  // `locations` table (schema.sql), not a hardcoded copy of the line codes.
  lines: () => apiFetch("/line-material-rules/lines"),
  // Upsert by (lineName, itemNo) - a second save for the same pair replaces
  // its note instead of erroring (see wpsApi's upsertLineMaterialRule), so
  // this one call serves both adding a new rule and editing an existing one.
  upsert: (rule) => apiFetch("/line-material-rules", { method: "POST", body: rule }),
  remove: (id) => apiFetch(`/line-material-rules/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
