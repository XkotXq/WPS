"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";

const PATH = "/dashboard/stock/frp-database";

export async function createCatalogEntryAction(entry) {
  const data = await api.createCatalogEntry(entry);
  revalidatePath(PATH);
  return data;
}

export async function updateCatalogEntryAction(number, entry) {
  const data = await api.updateCatalogEntry(number, entry);
  revalidatePath(PATH);
  return data;
}

export async function deleteCatalogEntryAction(number) {
  await api.deleteCatalogEntry(number);
  revalidatePath(PATH);
}
