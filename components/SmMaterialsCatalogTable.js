"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Upload, Hash } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToastStack, useToastStack } from "@/components/ui/toast";
import MaterialsTable from "@/components/MaterialsTable";
import FrpFilters from "@/components/FrpFilters";
import { smCatalogApi } from "@/lib/smCatalogApi";
import { parseCatalogFile } from "@/lib/catalogImportFile";
import SpoolNumberingDialog from "@/components/SpoolNumberingDialog";

const inputClasses =
  "w-full rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:border-navy-700 dark:focus:border-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400";
const fieldLabelClasses = "text-xs font-medium text-gray-500 dark:text-neutral-400";

const EMPTY_FORM = { category: "", itemNo: "", itemName: "", unit: "", remark: "", individualUnits: true };

// Mirrors CatalogTable.js's (Baza FRP) own add/edit-in-a-popover form
// shape - same interaction pattern, with this catalog's own fields
// (category, item number, name, unit, remark - see wpsapi's
// src/smCatalog.js) instead of Baza FRP's full number/label/name/type/mmc set.
function EntryForm({ initial, onSubmit, onCancel, submitLabel, t }) {
  const [form, setForm] = useState(() => initial ?? EMPTY_FORM);
  const [error, setError] = useState("");
  const isEdit = Boolean(initial);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!form.itemNo.trim() || !form.itemName.trim()) {
      setError(t("form.required"));
      return;
    }
    const ok = onSubmit({
      category: form.category.trim(),
      itemNo: form.itemNo.trim(),
      itemName: form.itemName.trim(),
      unit: form.unit.trim(),
      remark: form.remark.trim(),
      individualUnits: Boolean(form.individualUnits),
    });
    if (ok === false) {
      setError(t("form.duplicate"));
      return;
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div>
        <label className={fieldLabelClasses}>{t("form.category")}</label>
        <input type="text" value={form.category} onChange={(event) => set("category", event.target.value)} className={inputClasses} autoFocus />
      </div>
      <div>
        <label className={fieldLabelClasses}>{t("form.itemNo")}</label>
        <input
          type="text"
          value={form.itemNo}
          onChange={(event) => set("itemNo", event.target.value)}
          disabled={isEdit}
          className={`${inputClasses} disabled:opacity-60`}
        />
      </div>
      <div>
        <label className={fieldLabelClasses}>{t("form.itemName")}</label>
        <input type="text" value={form.itemName} onChange={(event) => set("itemName", event.target.value)} className={inputClasses} />
      </div>
      <div>
        <label className={fieldLabelClasses}>{t("form.unit")}</label>
        <input type="text" value={form.unit} onChange={(event) => set("unit", event.target.value)} className={inputClasses} />
      </div>
      <div>
        <label className={fieldLabelClasses}>{t("form.remark")}</label>
        <input type="text" value={form.remark} onChange={(event) => set("remark", event.target.value)} className={inputClasses} />
      </div>
      <label className="flex items-start gap-2 pt-1">
        <input
          type="checkbox"
          checked={Boolean(form.individualUnits)}
          onChange={(event) => set("individualUnits", event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-navy-700 focus:ring-navy-700 dark:border-neutral-600 dark:bg-neutral-800"
        />
        <span>
          <span className="block text-sm text-gray-900 dark:text-neutral-100">{t("form.individualUnitsLabel")}</span>
          <span className="block text-xs text-gray-500 dark:text-neutral-400">{t("form.individualUnitsHint")}</span>
        </span>
      </label>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" size="sm">
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t("form.cancel")}
        </Button>
      </div>
    </form>
  );
}

const COLUMNS = [
  { key: "category", headerKey: "materialsCategory", filterFn: "includesString", sortable: true },
  { key: "itemNo", headerKey: "materialsItemNo", filterFn: "includesString", sortable: true },
  { key: "itemName", headerKey: "materialsItemName", filterFn: "includesString", sortable: true },
  { key: "unit", headerKey: "materialsUnit", filterFn: "includesString", sortable: true },
  { key: "remark", headerKey: "materialsRemark", filterFn: "includesString", sortable: true },
  { key: "individualUnits", headerKey: "materialsIndividualUnits", type: "boolean", filterFn: "equals", sortable: true },
];

// Backed by wpsapi's sm_catalog table (src/smCatalog.js /
// routes/smCatalog.js) - a reference list of every known material,
// shared across whoever opens this page, not per-device like the rest of
// Materiały SM. Add/edit/delete here is what "jeżeli będzie jakiś nowy
// materiał używany, to tam będzie można dodać" (a newly-used material can
// be added here) refers to; ReceiveUnitPanel's handleItemNoBlur fetches
// from the same endpoint to autofill a material's name once its item
// number is known.
export default function SmMaterialsCatalogTable() {
  const t = useTranslations("materialsCatalogSm");
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpenFor, setEditOpenFor] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [numberingOpen, setNumberingOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importError, setImportError] = useState("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const { toasts, pushToast, dismissToast, pauseToast, resumeToast } = useToastStack();

  useEffect(() => {
    let cancelled = false;
    smCatalogApi
      .list()
      .then((data) => {
        if (!cancelled) setCatalog(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = catalog.map((entry) => ({ id: entry.itemNo, ...entry }));

  async function handleCreate(entry) {
    try {
      const created = await smCatalogApi.create(entry);
      setCatalog((prev) => [created, ...prev]);
      setAddOpen(false);
    } catch (err) {
      if (err.status === 409) return false;
      throw err;
    }
  }

  async function handleUpdate(itemNo, entry) {
    const updated = await smCatalogApi.update(itemNo, entry);
    setCatalog((prev) => prev.map((it) => (it.itemNo === itemNo ? updated : it)));
    setEditOpenFor(null);
  }

  function openImport() {
    setImportFile(null);
    setImportError("");
    setImportOpen(true);
  }

  // Reads the chosen spreadsheet (importKatalogu.xlsx) and shows what it
  // holds before anything is sent - see lib/catalogImportFile.js.
  async function handleImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImportError("");
    setImportFile(null);
    setParsing(true);
    try {
      setImportFile({ name: file.name, ...(await parseCatalogFile(file)) });
    } catch {
      setImportError(t("importDialog.readError"));
    } finally {
      setParsing(false);
    }
  }

  // Sent in chunks (a few hundred rows each) - the server upserts every entry
  // in one transaction per chunk: a new item number is created, an existing
  // one gets category/name/unit/remark overwritten, so re-importing a
  // refreshed file works as "sync". individualUnits is left alone on update
  // (the file has no column for it) and defaults to off on create.
  async function handleImport() {
    if (!importFile?.entries.length || importing) return;
    setImporting(true);
    setImportError("");
    let created = 0;
    let updated = 0;
    let failed = 0;
    try {
      for (let i = 0; i < importFile.entries.length; i += 200) {
        const result = await smCatalogApi.importEntries(importFile.entries.slice(i, i + 200));
        created += result.created;
        updated += result.updated;
        failed += result.failed.length;
      }
    } catch (err) {
      setImportError(err.message);
      setImporting(false);
      // Earlier chunks did go through - show them.
      setCatalog(await smCatalogApi.list());
      return;
    }
    setCatalog(await smCatalogApi.list());
    setImporting(false);
    setImportOpen(false);
    pushToast(t("toast.imported", { created, updated, failed }));
  }

  async function handleDelete(itemNo) {
    if (!window.confirm(t("actions.confirmDelete", { itemNo }))) return;
    await smCatalogApi.remove(itemNo);
    setCatalog((prev) => prev.filter((it) => it.itemNo !== itemNo));
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          {loading ? t("loading") : loadError ? t("fetchError") : t("count", { count: catalog.length })}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setNumberingOpen(true)}>
            <Hash className="h-4 w-4" />
            {t("actions.spoolNumbering")}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={openImport}>
            <Upload className="h-4 w-4" />
            {t("actions.import")}
          </Button>
          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger
              render={
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  {t("actions.add")}
                </Button>
              }
            />
            <PopoverContent align="end" className="w-80">
              <EntryForm t={t} submitLabel={t("actions.save")} onSubmit={handleCreate} onCancel={() => setAddOpen(false)} />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <SpoolNumberingDialog open={numberingOpen} onOpenChange={setNumberingOpen} />

      <Dialog open={importOpen} onOpenChange={(open) => !importing && setImportOpen(open)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("importDialog.title")}</DialogTitle>
            <DialogDescription>{t("importDialog.hint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-700 hover:bg-gray-50 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800">
              <Upload className="h-4 w-4 shrink-0" />
              <span className="truncate">{importFile ? importFile.name : t("importDialog.chooseFile")}</span>
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportFile} disabled={parsing || importing} />
            </label>
            {parsing && <p className="text-sm text-gray-500 dark:text-neutral-400">{t("importDialog.reading")}</p>}
            {importError && <p className="text-xs text-red-600 dark:text-red-400">{importError}</p>}
            {importFile && (
              <div className="space-y-2 text-sm text-gray-700 dark:text-neutral-200">
                <p>{t("importDialog.summary", { rows: importFile.totalRows, unique: importFile.entries.length })}</p>
                {importFile.duplicates > 0 && (
                  <p className="text-xs text-gray-500 dark:text-neutral-400">{t("importDialog.duplicates", { count: importFile.duplicates })}</p>
                )}
                {importFile.skipped > 0 && (
                  <p className="text-xs text-red-600 dark:text-red-400">{t("importDialog.skipped", { count: importFile.skipped })}</p>
                )}
                <ul className="max-h-40 space-y-0.5 overflow-auto rounded-lg border border-gray-200 px-3 py-2 text-xs dark:border-neutral-700">
                  {importFile.entries.slice(0, 8).map((entry) => (
                    <li key={entry.itemNo} className="truncate">
                      <span className="text-gray-400 dark:text-neutral-500">{entry.category || "-"}</span> · {entry.itemNo} · {entry.itemName} ·{" "}
                      {entry.unit || "-"}
                      {entry.remark ? ` · ${entry.remark}` : ""}
                    </li>
                  ))}
                  {importFile.entries.length > 8 && <li className="text-gray-400 dark:text-neutral-500">…</li>}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" disabled={importing} onClick={() => setImportOpen(false)}>
              {t("importDialog.cancel")}
            </Button>
            <Button size="sm" disabled={!importFile?.entries.length || importing || parsing} onClick={handleImport}>
              {importing ? t("importDialog.importing") : t("importDialog.save", { count: importFile?.entries.length ?? 0 })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ToastStack toasts={toasts} onDismiss={dismissToast} onPause={pauseToast} onResume={resumeToast} />

      <div className="mt-4">
        <FrpFilters onGlobalFilterChange={setSearch} />

        <MaterialsTable
          data={rows}
          columns={COLUMNS}
          globalFilter={search}
          onGlobalFilterChange={setSearch}
          renderRowActions={(row) => (
            <div className="flex items-center justify-end gap-1">
              <Popover open={editOpenFor === row.itemNo} onOpenChange={(open) => setEditOpenFor(open ? row.itemNo : null)}>
                <PopoverTrigger
                  render={
                    <button
                      type="button"
                      title={t("actions.edit")}
                      className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  }
                />
                <PopoverContent align="end" className="w-80">
                  <EntryForm t={t} initial={row} submitLabel={t("actions.save")} onSubmit={(entry) => handleUpdate(row.itemNo, entry)} onCancel={() => setEditOpenFor(null)} />
                </PopoverContent>
              </Popover>
              <button
                type="button"
                title={t("actions.delete")}
                onClick={() => handleDelete(row.itemNo)}
                className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:text-neutral-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        />
      </div>
    </div>
  );
}
