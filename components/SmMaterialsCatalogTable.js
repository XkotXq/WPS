"use client";

import { useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import MaterialsTable from "@/components/MaterialsTable";
import FrpFilters from "@/components/FrpFilters";
import { SM_CATALOG_SEED, SM_CATALOG_STORAGE_KEY } from "@/lib/smMaterialsCatalog";

const inputClasses =
  "w-full rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:border-navy-700 dark:focus:border-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400";
const fieldLabelClasses = "text-xs font-medium text-gray-500 dark:text-neutral-400";

const EMPTY_FORM = { itemNo: "", itemName: "", individualUnits: true, unitType: "spool" };

const UNIT_TYPE_LABEL_KEYS = { spool: "unitTypeSpool", bigbag: "unitTypeBigbag", thread: "unitTypeThread", other: "unitTypeOther" };

function UnitTypeLabel({ unitType }) {
  const t = useTranslations("materialsCatalogSm");
  if (!unitType) return <span className="text-gray-400 dark:text-neutral-500">-</span>;
  return <span>{t(UNIT_TYPE_LABEL_KEYS[unitType] ?? "unitTypeOther")}</span>;
}

// Mirrors CatalogTable.js's (Baza FRP) own add/edit-in-a-popover form
// shape - same interaction pattern, just itemNo+itemName only for now
// (see lib/smMaterialsCatalog.js) instead of Baza FRP's full
// number/label/name/type/mmc set.
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
    const individualUnits = Boolean(form.individualUnits);
    const ok = onSubmit({
      itemNo: form.itemNo.trim(),
      itemName: form.itemName.trim(),
      individualUnits,
      unitType: individualUnits ? form.unitType || "spool" : undefined,
    });
    if (ok === false) {
      setError(t("form.duplicate"));
      return;
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div>
        <label className={fieldLabelClasses}>{t("form.itemNo")}</label>
        <input
          type="text"
          value={form.itemNo}
          onChange={(event) => set("itemNo", event.target.value)}
          disabled={isEdit}
          className={`${inputClasses} disabled:opacity-60`}
          autoFocus
        />
      </div>
      <div>
        <label className={fieldLabelClasses}>{t("form.itemName")}</label>
        <input type="text" value={form.itemName} onChange={(event) => set("itemName", event.target.value)} className={inputClasses} />
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
      {form.individualUnits && (
        <div>
          <label className={fieldLabelClasses}>{t("form.unitTypeLabel")}</label>
          <select value={form.unitType || "spool"} onChange={(event) => set("unitType", event.target.value)} className={inputClasses}>
            <option value="spool">{t("unitTypeSpool")}</option>
            <option value="bigbag">{t("unitTypeBigbag")}</option>
            <option value="thread">{t("unitTypeThread")}</option>
            <option value="other">{t("unitTypeOther")}</option>
          </select>
        </div>
      )}
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
  { key: "itemNo", headerKey: "materialsItemNo", filterFn: "includesString", sortable: true },
  { key: "itemName", headerKey: "materialsItemName", filterFn: "includesString", sortable: true },
  { key: "individualUnits", headerKey: "materialsIndividualUnits", type: "boolean", filterFn: "equals", sortable: true },
  {
    key: "unitType",
    headerKey: "materialsUnitType",
    filterFn: "multiselect",
    sortable: true,
    render: (row) => <UnitTypeLabel unitType={row.unitType} />,
  },
];

// Local-only reference catalog (see lib/smMaterialsCatalog.js) - not tied
// to CIP or any backend, same as the rest of Materiały SM. Add/edit/delete
// here is what "jeżeli będzie jakiś nowy materiał używany, to tam będzie
// można dodać" (a newly-used material can be added here) refers to;
// ReceiveUnitPanel's handleItemNoBlur reads this same storage key to
// autofill a material's name once its item number is known.
export default function SmMaterialsCatalogTable() {
  const t = useTranslations("materialsCatalogSm");
  const [catalog, setCatalog] = useLocalStorage(SM_CATALOG_STORAGE_KEY, SM_CATALOG_SEED);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpenFor, setEditOpenFor] = useState(null);

  // `?? true` covers rows saved by an earlier build of this catalog (or its
  // now-inverted `stackable` field) - defaulting to individually-tracked
  // keeps every pre-existing entry's displayed meaning the same as before
  // this checkbox was flipped, instead of silently flipping their data too.
  // Same idea for `unitType`: rows saved before this field existed get
  // "spool" (matching every real unit's own default) as long as they're
  // still individually tracked - otherwise it stays unset (not applicable).
  const rows = catalog.map((entry) => {
    const individualUnits = entry.individualUnits ?? true;
    return { id: entry.itemNo, ...entry, individualUnits, unitType: individualUnits ? entry.unitType ?? "spool" : undefined };
  });

  function handleCreate(entry) {
    if (catalog.some((it) => it.itemNo.toLowerCase() === entry.itemNo.toLowerCase())) return false;
    setCatalog((prev) => [entry, ...prev]);
    setAddOpen(false);
  }

  function handleUpdate(itemNo, entry) {
    setCatalog((prev) =>
      prev.map((it) => (it.itemNo === itemNo ? { ...it, itemName: entry.itemName, individualUnits: entry.individualUnits, unitType: entry.unitType } : it))
    );
    setEditOpenFor(null);
  }

  function handleDelete(itemNo) {
    if (!window.confirm(t("actions.confirmDelete", { itemNo }))) return;
    setCatalog((prev) => prev.filter((it) => it.itemNo !== itemNo));
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-neutral-400">{t("count", { count: catalog.length })}</p>
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
