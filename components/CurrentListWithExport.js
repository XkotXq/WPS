"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
import ReportsMaterialTabs from "@/components/ReportsMaterialTabs";
import CurrentListSection from "@/components/CurrentListSection";
import { Button } from "@/components/ui/button";

// Wraps the material tabs + "Eksportuj do CIP" button together with the
// table below so the button can react to the table's own row-selection
// state - the export/tabs row and the table live in a server component
// (current/page.js) otherwise, so this state has to be held together on
// the client side.
export default function CurrentListWithExport({ material, items, columns }) {
  const tExport = useTranslations("stock.export");
  const [selection, setSelection] = useState({});
  const hasSelection = Object.keys(selection).length > 0;

  // Row ids (and their checkboxes) belong to whichever material's table is
  // currently mounted - a stale selection from before a material switch
  // must not keep the button enabled for a table that shows nothing checked.
  useEffect(() => {
    setSelection({});
  }, [material]);

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <ReportsMaterialTabs material={material} />
        {material === "frp" && (
          <Button variant="outline" size="sm" className="gap-2" disabled={!hasSelection}>
            <Send className="h-4 w-4" />
            {tExport("cipButton")}
          </Button>
        )}
      </div>

      <div className="mt-6">
        <CurrentListSection key={material} items={items} columns={columns} onSelectionChange={setSelection} />
      </div>
    </>
  );
}
