"use client";

import { useEffect, useMemo, useState } from "react";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
import ReportsMaterialTabs from "@/components/ReportsMaterialTabs";
import CurrentListSection from "@/components/CurrentListSection";
import ExportFrpToCipPanel from "@/components/ExportFrpToCipPanel";
import AddItemPanel from "@/components/AddItemPanel";
import { Button } from "@/components/ui/button";

// Wraps the material tabs + "Eksportuj do CIP"/"Dodaj" buttons together
// with the table below so they can react to the table's own row-selection
// state - the button row and the table live in a server component
// (current/page.js) otherwise, so this state has to be held together on
// the client side.
export default function CurrentListWithExport({ material, items, columns, frpCatalog = [] }) {
  const tExport = useTranslations("stock.export");
  const [selection, setSelection] = useState({});
  const [panelOpen, setPanelOpen] = useState(false);
  const hasSelection = Object.keys(selection).length > 0;

  const selectedItems = useMemo(() => items.filter((item) => selection[item.id]), [items, selection]);

  // Row ids (and their checkboxes) belong to whichever material's table is
  // currently mounted - a stale selection from before a material switch
  // must not keep the button enabled for a table that shows nothing checked.
  useEffect(() => {
    setSelection({});
    setPanelOpen(false);
  }, [material]);

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <ReportsMaterialTabs material={material} />
        <div className="flex items-center gap-2">
          <AddItemPanel material={material} frpCatalog={frpCatalog} />
          {material === "frp" && (
            <Button variant="outline" size="sm" className="gap-2" disabled={!hasSelection} onClick={() => setPanelOpen(true)}>
              <Send className="h-4 w-4" />
              {tExport("cipButton")}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-6">
        <CurrentListSection key={material} items={items} columns={columns} onSelectionChange={setSelection} />
      </div>

      {material === "frp" && (
        <ExportFrpToCipPanel
          open={panelOpen}
          onOpenChange={setPanelOpen}
          items={selectedItems}
          onExported={() => setSelection({})}
        />
      )}
    </>
  );
}
