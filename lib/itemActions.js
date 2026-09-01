"use server";

import { api } from "@/lib/api";

// Thin "use server" wrapper so a client component (AddItemPanel) can call
// the Express API's create-item endpoint - api.js itself reads plain
// (non-NEXT_PUBLIC) env vars and can't be imported into client code.
export async function createCurrentItem(material, body) {
  try {
    const created = await api.createItem(material, body);
    return { ok: true, item: created };
  } catch (err) {
    return { ok: false, error: err.message || "Nie udało się zapisać." };
  }
}
