"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import MaterialsTable from "@/components/MaterialsTable";
import FrpFilters from "@/components/FrpFilters";
import ExportStockMenu from "@/components/ExportStockMenu";
import {
  frpMaterials,
  coatedFrpMaterials,
  fillerMaterials,
  frpColumns,
  coatedFrpColumns,
  fillerColumns,
} from "@/lib/materials-data";

const MATERIAL_PARAM = "material";
const VALID_MATERIALS = ["frp", "coatedFrp", "filler"];
const DEFAULT_MATERIAL = "frp";

export default function StockMaterialsTabs() {
  const t = useTranslations("stock.tabs");
  const tExport = useTranslations("stock.export");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [frpSearch, setFrpSearch] = useState("");

  const requestedMaterial = searchParams.get(MATERIAL_PARAM);
  const activeMaterial = VALID_MATERIALS.includes(requestedMaterial)
    ? requestedMaterial
    : DEFAULT_MATERIAL;

  const setMaterialParam = useCallback(
    (value) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(MATERIAL_PARAM, value);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    if (!VALID_MATERIALS.includes(requestedMaterial)) {
      setMaterialParam(DEFAULT_MATERIAL);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedMaterial]);

  return (
    <Tabs value={activeMaterial} onValueChange={setMaterialParam}>
      <div className="flex items-center justify-between">
        <TabsList>
          <TabsTrigger value="frp">{t("frp")}</TabsTrigger>
          <TabsTrigger value="coatedFrp">{t("coatedFrp")}</TabsTrigger>
          <TabsTrigger value="filler">{t("filler")}</TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Send className="h-4 w-4" />
            {tExport("cipButton")}
          </Button>
          <ExportStockMenu />
        </div>
      </div>

      <TabsContent value="frp" className="mt-4">
        <FrpFilters onGlobalFilterChange={setFrpSearch} />
        <MaterialsTable
          data={frpMaterials}
          columns={frpColumns}
          globalFilter={frpSearch}
          onGlobalFilterChange={setFrpSearch}
          showOrderRailAction
        />
      </TabsContent>
      <TabsContent value="coatedFrp" className="mt-4">
        <MaterialsTable data={coatedFrpMaterials} columns={coatedFrpColumns} />
      </TabsContent>
      <TabsContent value="filler" className="mt-4">
        <MaterialsTable data={fillerMaterials} columns={fillerColumns} />
      </TabsContent>
    </Tabs>
  );
}
