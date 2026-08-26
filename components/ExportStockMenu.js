"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const MATERIALS = ["frp", "coatedFrp", "filler"];

export default function ExportStockMenu() {
  const t = useTranslations("stock.export");
  const tTabs = useTranslations("stock.tabs");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(() =>
    Object.fromEntries(MATERIALS.map((material) => [material, true]))
  );

  function toggleMaterial(material, value) {
    setSelected((prev) => ({ ...prev, [material]: value }));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            {t("button")}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-64">
        <p className="text-xs font-medium text-gray-500 dark:text-neutral-400">
          {t("selectMaterials")}
        </p>
        <div className="mt-1 space-y-2">
          {MATERIALS.map((material) => (
            <label
              key={material}
              className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-neutral-200"
            >
              <Checkbox
                checked={selected[material]}
                onCheckedChange={(value) => toggleMaterial(material, Boolean(value))}
              />
              {tTabs(material)}
            </label>
          ))}
        </div>
        <Button size="sm" className="mt-3 w-full" onClick={() => setOpen(false)}>
          {t("confirm")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
