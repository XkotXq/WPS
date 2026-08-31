"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import MaterialsTable from "@/components/MaterialsTable";
import FrpFilters from "@/components/FrpFilters";
import { frpCatalogColumns, mapCatalogEntry } from "@/lib/materials-data";
import {
  createCatalogEntryAction,
  updateCatalogEntryAction,
  deleteCatalogEntryAction,
} from "@/app/dashboard/stock/frp-database/actions";

const EMPTY_FORM = { number: "", label: "", name: "", type: "XB", mmc: false };

const inputClasses =
  "w-full rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1.5 text-sm text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:border-navy-700 dark:focus:border-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400";

const fieldLabelClasses = "text-xs font-medium text-gray-500 dark:text-neutral-400";

function EntryForm({ initial, onSubmit, onCancel, submitLabel, t }) {
  const [form, setForm] = useState(() => initial ?? EMPTY_FORM);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const isEdit = Boolean(initial);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await onSubmit(form);
      } catch (err) {
        setError(err.message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div>
        <label className={fieldLabelClasses}>{t("form.number")}</label>
        <input
          type="text"
          inputMode="numeric"
          value={form.number}
          onChange={(event) => set("number", event.target.value)}
          disabled={isEdit}
          className={`${inputClasses} disabled:opacity-60`}
          required
        />
      </div>
      <div>
        <label className={fieldLabelClasses}>{t("form.label")}</label>
        <input
          type="text"
          value={form.label}
          onChange={(event) => set("label", event.target.value)}
          className={inputClasses}
          required
        />
      </div>
      <div>
        <label className={fieldLabelClasses}>{t("form.name")}</label>
        <input
          type="text"
          value={form.name}
          onChange={(event) => set("name", event.target.value)}
          className={inputClasses}
          required
        />
      </div>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className={fieldLabelClasses}>{t("form.type")}</label>
          <select
            value={form.type}
            onChange={(event) => set("type", event.target.value)}
            className={inputClasses}
          >
            <option value="XB">XB</option>
            <option value="Z">Z</option>
          </select>
        </div>
        <label className="flex h-[38px] cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-neutral-200">
          <Checkbox checked={form.mmc} onCheckedChange={(value) => set("mmc", Boolean(value))} />
          {t("form.mmc")}
        </label>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" size="sm" disabled={pending}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          {t("form.cancel")}
        </Button>
      </div>
    </form>
  );
}

// Dynamic "Baza FRP" admin page: lists the FRP catalog (item number, label,
// name, XB/Z type, MMC flag) straight from GET /api/catalog and lets it be
// edited in place - the same catalog used to resolve mmc/type/name when
// rendering frp_stock/frp_current rows elsewhere in the app.
export default function CatalogTable({ data }) {
  const t = useTranslations("stockFrpDatabase");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpenFor, setEditOpenFor] = useState(null);
  const [deletingNumber, setDeletingNumber] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  const rows = data.map(mapCatalogEntry);

  async function handleCreate(form) {
    await createCatalogEntryAction(form);
    setAddOpen(false);
  }

  async function handleUpdate(number, form) {
    await updateCatalogEntryAction(number, form);
    setEditOpenFor(null);
  }

  async function handleDelete(number) {
    if (!window.confirm(t("actions.confirmDelete", { number }))) return;
    setDeleteError(null);
    setDeletingNumber(number);
    try {
      await deleteCatalogEntryAction(number);
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeletingNumber(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-end">
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger
            render={
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                {t("actions.add")}
              </Button>
            }
          />
          <PopoverContent align="end" className="w-80">
            <EntryForm
              t={t}
              submitLabel={t("actions.save")}
              onSubmit={handleCreate}
              onCancel={() => setAddOpen(false)}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="mt-4">
        <FrpFilters onGlobalFilterChange={setSearch} />

        {deleteError && (
          <p className="mb-2 text-xs text-red-600 dark:text-red-400">{deleteError}</p>
        )}

        <MaterialsTable
          data={rows}
          columns={frpCatalogColumns}
          globalFilter={search}
          onGlobalFilterChange={setSearch}
          renderRowActions={(row) => (
            <div className="flex items-center justify-end gap-1">
              <Popover
                open={editOpenFor === row.number}
                onOpenChange={(open) => setEditOpenFor(open ? row.number : null)}
              >
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
                  <EntryForm
                    t={t}
                    initial={row}
                    submitLabel={t("actions.save")}
                    onSubmit={(form) => handleUpdate(row.number, form)}
                    onCancel={() => setEditOpenFor(null)}
                  />
                </PopoverContent>
              </Popover>
              <button
                type="button"
                title={t("actions.delete")}
                disabled={deletingNumber === row.number}
                onClick={() => handleDelete(row.number)}
                className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-neutral-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
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
