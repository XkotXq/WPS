"use client";

import { apiFetch } from "@/lib/smCatalogApi";

// Backs `employee_roles` (see wpsapi's schema.sql and src/employeeRoles.js)
// - "Uprawnienia", who is who by employee number.
//
// **Setting a role here enforces nothing yet.** There is still one shared
// API_TOKEN and no per-user check in the API, so this is the mapping that
// roadmap step 1 ("Per-user auth") will read once a login issues a token of
// its own. Filled in by hand, like every other reference table in this app.
export const employeeRolesApi = {
  // The roles this installation knows - from the server, so this screen
  // cannot drift from what the API will accept.
  roles: () => apiFetch("/employee-roles/roles"),
  // Everybody who has ever logged in to any of the apps, with whatever role
  // they have. `login_events` is the only record of who exists at all -
  // there is no employee table anywhere and CIP is not asked for one.
  known: () => apiFetch("/employee-roles/known"),
  upsert: (employeeNo, body) =>
    apiFetch(`/employee-roles/${encodeURIComponent(employeeNo)}`, { method: "PUT", body }),
  remove: (employeeNo) => apiFetch(`/employee-roles/${encodeURIComponent(employeeNo)}`, { method: "DELETE" }),
};
