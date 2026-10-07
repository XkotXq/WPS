"use client";

import { apiFetch } from "@/lib/smCatalogApi";

// "Krótkie odcinki" (Transporty) - what forklift operators reported from
// inside a task: that what they brought was remnants rather than a full
// drum, which material, how much and a photo of it.
//
// Read-only here. The reports are made in smVendor, at the material; this
// dashboard is where they are reviewed.
export const shortLengthsApi = {
  list: () => apiFetch("/short-lengths"),
};
