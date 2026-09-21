"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { smSpoolsApi } from "@/lib/smSpoolsApi";

const inputClasses =
  "w-full rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm text-gray-900 dark:text-neutral-100 focus:border-navy-700 dark:focus:border-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400";
const headerClasses = "text-xs font-medium text-gray-500 dark:text-neutral-400";

const NEW_SERIES = { prefix: "", digits: 3, from: 1, to: 999 };

// Which spool numbers smpda's FRP module hands out (see wpsapi's
// src/smSpools.js): an ordered list of series - "Y" + 3 digits from 1 to 999,
// then the next one when that's used up. The server checks the values; its
// message is shown as-is.
export default function SpoolNumberingDialog({ open, onOpenChange }) {
  const t = useTranslations("materialsCatalogSm.spoolNumbering");
  const [series, setSeries] = useState([]);
  const [nextNumber, setNextNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadNext() {
    try {
      setNextNumber((await smSpoolsApi.next()).unitId);
    } catch (err) {
      setNextNumber(err.message);
    }
  }

  useEffect(() => {
    if (!open) return;
    setError("");
    setLoading(true);
    smSpoolsApi
      .getSettings()
      .then((data) => setSeries(data.series))
      .catch(() => setError(t("loadError")))
      .finally(() => setLoading(false));
    loadNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function update(index, field, value) {
    setSeries((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const saved = await smSpoolsApi.saveSettings(
        series.map((row) => ({
          prefix: String(row.prefix).trim(),
          digits: Number(row.digits),
          from: Number(row.from),
          to: Number(row.to),
        }))
      );
      setSeries(saved.series);
      await loadNext();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("hint")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-gray-700 dark:text-neutral-200">
            {t("nextNumber")}: <span className="font-semibold">{nextNumber || "…"}</span>
          </p>
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-neutral-400">{t("loading")}</p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 px-0.5">
                <span className={headerClasses}>{t("prefix")}</span>
                <span className={headerClasses}>{t("digits")}</span>
                <span className={headerClasses}>{t("from")}</span>
                <span className={headerClasses}>{t("to")}</span>
                <span className="w-8" />
              </div>
              {series.map((row, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-center gap-2">
                  <input className={inputClasses} value={row.prefix} onChange={(event) => update(index, "prefix", event.target.value)} />
                  <input className={inputClasses} type="number" min="1" max="8" value={row.digits} onChange={(event) => update(index, "digits", event.target.value)} />
                  <input className={inputClasses} type="number" min="0" value={row.from} onChange={(event) => update(index, "from", event.target.value)} />
                  <input className={inputClasses} type="number" min="0" value={row.to} onChange={(event) => update(index, "to", event.target.value)} />
                  <button
                    type="button"
                    title={t("remove")}
                    disabled={series.length <= 1}
                    onClick={() => setSeries((prev) => prev.filter((_, i) => i !== index))}
                    className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 dark:text-neutral-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setSeries((prev) => [...prev, { ...NEW_SERIES }])}
                className="flex items-center gap-1 text-sm font-medium text-navy-700 hover:underline dark:text-navy-300"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("addSeries")}
              </button>
            </div>
          )}
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" disabled={saving} onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
          <Button size="sm" disabled={saving || loading} onClick={handleSave}>
            {saving ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
