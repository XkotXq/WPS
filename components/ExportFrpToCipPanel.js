"use client";

import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { exportFrpToCip } from "@/lib/cipExport";
import { checkFrpImportStatus } from "@/lib/cipImportStatus";

// items here are already the display-shaped rows from mapFrpItem
// (materials-data.js): item = catalog item number, diameter = catalog
// name, length = km, spoolNumber = drum number, note = remark. Those map
// straight onto CIP's inStorage body - see lib/cipExport.js for why.
export default function ExportFrpToCipPanel({ open, onOpenChange, items, onExported }) {
  const t = useTranslations("stock.export");
  const [exporting, setExporting] = useState(false);
  const [results, setResults] = useState(null);
  // itemNo -> { loading, checked, imported, specifications } - fetched
  // fresh every time the panel opens, since "already in CIP" can change
  // between one open and the next.
  const [importStatus, setImportStatus] = useState({});

  useEffect(() => {
    if (!open || items.length === 0) return;
    setImportStatus(Object.fromEntries(items.map((item) => [item.item, { loading: true }])));
    let cancelled = false;
    Promise.all(
      items.map(async (item) => {
        const status = await checkFrpImportStatus(item.item);
        return [item.item, { loading: false, ...status }];
      })
    ).then((entries) => {
      if (!cancelled) setImportStatus(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items.map((item) => item.item).join(",")]);

  async function handleExport() {
    setExporting(true);
    setResults(null);
    const payload = items.map((item) => ({
      itemNo: item.item,
      itemName: item.diameter,
      locationCode: item.spoolNumber,
      note: item.note,
      specifications: item.length,
    }));
    const outcome = await exportFrpToCip(payload);
    setResults(outcome.results);
    setExporting(false);
    if (outcome.ok) onExported?.();
  }

  function handleOpenChange(next) {
    if (!exporting) {
      setResults(null);
      onOpenChange(next);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("cipPanelTitle")}</SheetTitle>
          {/* <SheetDescription>{t("cipPanelDescription")}</SheetDescription> */}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <ul className="divide-y divide-gray-100 dark:divide-neutral-800">
            {items.map((item) => {
              const result = results?.find((r) => r.itemNo === item.item);
              const status = importStatus[item.item];
              return (
                <li key={item.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-neutral-100">{item.diameter}</p>
                    <p className="text-xs text-gray-500 dark:text-neutral-400">
                      {item.item} · {t("cipPanelDrum")} {item.spoolNumber} · {item.length} km
                    </p>
                  </div>
                  {result ? (
                    <span
                      className={`shrink-0 text-xs font-medium ${
                        result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {result.ok ? t("cipPanelItemOk") : result.error}
                    </span>
                  ) : status?.loading ? (
                    <span className="shrink-0 text-xs text-gray-400 dark:text-neutral-500">{t("cipPanelChecking")}</span>
                  ) : status?.checked && status.imported ? (
                    <span className="shrink-0 text-xs font-medium text-amber-600 dark:text-amber-400">
                      {t("cipPanelAlreadyImported")}
                      {status.specifications != null ? ` (${status.specifications})` : ""}
                    </span>
                  ) : status?.checked ? (
                    <span className="shrink-0 text-xs font-medium text-gray-400 dark:text-neutral-500">{t("cipPanelNotImported")}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>

        <SheetFooter>
          <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)} disabled={exporting}>
            {t("cipPanelCancel")}
          </Button>
          <Button size="sm" className="gap-2" onClick={handleExport} disabled={exporting || items.length === 0}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {exporting ? t("exporting") : t("cipPanelExportButton", { count: items.length })}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
