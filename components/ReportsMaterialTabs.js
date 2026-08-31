"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const MATERIAL_PARAM = "material";
const VALID_MATERIALS = ["frp", "coatedFrp", "filler"];

// URL-driven material switch (?material=) for the Reports page - unlike
// the Stock page's tabs (which preload all 3 materials client-side),
// switching here re-fetches just the selected material's snapshot on
// the server, since a report only ever looks at one material at a time.
export default function ReportsMaterialTabs({ material }) {
  const t = useTranslations("stock.tabs");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setMaterial = useCallback(
    (value) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(MATERIAL_PARAM, value);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return (
    <Tabs value={material} onValueChange={setMaterial}>
      <TabsList>
        {VALID_MATERIALS.map((key) => (
          <TabsTrigger key={key} value={key}>
            {t(key)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
