"use server";

import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";

export async function submitCheckAction(material, payload) {
  const data = await api.submitCheck(material, payload);
  revalidatePath(`/dashboard/stock/check/${material}`);
  revalidatePath("/dashboard/stock");
  return data;
}
