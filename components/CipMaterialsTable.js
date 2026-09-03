"use client";

import { useEffect, useState } from "react";
import { Pencil, PackageMinus } from "lucide-react";
import { useTranslations } from "next-intl";
import MaterialsTable from "@/components/MaterialsTable";
import FrpFilters from "@/components/FrpFilters";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const COLUMNS = [
  { key: "itemNo", headerKey: "materialsItemNo", filterFn: "includesString", sortable: true },
  { key: "itemName", headerKey: "materialsItemName", filterFn: "includesString", sortable: true, className: "max-w-[220px] truncate" },
  { key: "specifications", headerKey: "materialsSpec", filterFn: "inNumberRange", sortable: true },
  { key: "locationCode", headerKey: "materialsLocation", filterFn: "multiselect", sortable: true },
  { key: "note", headerKey: "note", filterFn: "includesString" },
  { key: "createTime", headerKey: "materialsCreateTime", filterFn: "includesString", sortable: true },
];

const FIELD_CLS =
  "h-10 w-full rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-neutral-100 focus:border-navy-700 dark:focus:border-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400";
const LABEL_CLS = "text-xs font-medium text-gray-500 dark:text-neutral-400";
const ROW_ACTION_CLS =
  "rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200";

// Read-only recap of the row an edit/issue panel is acting on, so the
// person filling in the form doesn't have to close the sheet to double
// check which material (and how much of it) they're touching.
function MaterialInfo({ row, tColumns }) {
  return (
    <div className="rounded-lg border border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/50 p-3 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        <dt className="text-gray-500 dark:text-neutral-400">{tColumns("materialsItemNo")}</dt>
        <dd className="font-medium text-gray-900 dark:text-neutral-100">{row.itemNo || "-"}</dd>
        <dt className="text-gray-500 dark:text-neutral-400">{tColumns("materialsItemName")}</dt>
        <dd className="font-medium text-gray-900 dark:text-neutral-100">{row.itemName || "-"}</dd>
        <dt className="text-gray-500 dark:text-neutral-400">{tColumns("materialsSpec")}</dt>
        <dd className="font-medium text-gray-900 dark:text-neutral-100">{row.specifications || "-"}</dd>
        <dt className="text-gray-500 dark:text-neutral-400">{tColumns("materialsLocation")}</dt>
        <dd className="font-medium text-gray-900 dark:text-neutral-100">{row.locationCode || "-"}</dd>
      </dl>
    </div>
  );
}

// CIP inventory is read live from the old system (see page.js) - there's
// nowhere yet to persist an edit back to, so this is a placeholder shell:
// the fields update locally but "Zapisz" doesn't write anything. Kept as
// a real form (not just a static message) so the eventual save wiring
// only has to add the submit call, not build the UI too.
function EditMaterialPanel({ row, open, onOpenChange }) {
  const t = useTranslations("materialsList.editPanel");
  const tColumns = useTranslations("stock.columns");
  const [itemName, setItemName] = useState("");
  const [specifications, setSpecifications] = useState("");
  const [locationCode, setLocationCode] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!row) return;
    setItemName(row.itemName);
    setSpecifications(String(row.specifications ?? ""));
    setLocationCode(row.locationCode);
    setNote(row.note);
  }, [row]);

  if (!row) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>{t("description")}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
          <MaterialInfo row={row} tColumns={tColumns} />

          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>{tColumns("materialsItemName")}</span>
            <input className={FIELD_CLS} value={itemName} onChange={(e) => setItemName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>{tColumns("materialsSpec")}</span>
            <input className={FIELD_CLS} value={specifications} onChange={(e) => setSpecifications(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>{tColumns("materialsLocation")}</span>
            <input className={FIELD_CLS} value={locationCode} onChange={(e) => setLocationCode(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>{tColumns("note")}</span>
            <input className={FIELD_CLS} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>

          <p className="text-xs text-gray-400 dark:text-neutral-500">{t("note")}</p>
        </div>

        <SheetFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            {t("save")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// Same "no backend yet" situation as EditMaterialPanel - quantity/note
// are validated for real (required, numeric, capped at the material's
// own specifications figure) so the form behaves correctly once an
// actual issue-recording endpoint exists; submitting just closes the
// sheet for now.
function IssueMaterialPanel({ row, open, onOpenChange }) {
  const t = useTranslations("materialsList.issuePanel");
  const tColumns = useTranslations("stock.columns");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!row) return;
    setQuantity("");
    setNote("");
    setError("");
  }, [row]);

  if (!row) return null;

  const availableQty = Number(row.specifications);
  const hasAvailableQty = Number.isFinite(availableQty);

  function handleSubmit(e) {
    e.preventDefault();
    const value = Number(String(quantity).trim().replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      setError(t("requiredQuantity"));
      return;
    }
    if (hasAvailableQty && value > availableQty) {
      setError(t("maxQuantity", { max: availableQty }));
      return;
    }
    setError("");
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>{t("description")}</SheetDescription>
        </SheetHeader>

        <form id="issue-material-form" onSubmit={handleSubmit} className="flex flex-1 flex-col gap-3 overflow-y-auto">
          <MaterialInfo row={row} tColumns={tColumns} />

          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>{t("quantityLabel")}</span>
            <input
              className={FIELD_CLS}
              inputMode="decimal"
              placeholder="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>{t("noteLabel")}</span>
            <textarea
              className={`${FIELD_CLS} h-20 resize-none py-2`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <p className="text-xs text-gray-400 dark:text-neutral-500">{t("note")}</p>
        </form>

        <SheetFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button type="submit" form="issue-material-form" size="sm">
            {t("confirm")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// Live inventory from the old CIP system (materialTemporaryStorageWarehouse)
// - fetched server-side in page.js (server-to-server, no CORS) with the
// viewer's own CIP session token, then just rendered here.
export default function CipMaterialsTable({ records }) {
  const t = useTranslations("materialsList");
  const [search, setSearch] = useState("");
  const [editingRow, setEditingRow] = useState(null);
  const [issuingRow, setIssuingRow] = useState(null);

  const data = records.map((r) => ({
    id: r.id,
    itemNo: r.itemNo ?? "",
    itemName: r.itemName ?? "",
    specifications: r.specifications ?? "",
    locationCode: r.locationCode ?? "",
    note: r.note ?? "",
    createTime: r.createTime ?? "",
  }));

  return (
    <div>
      <p className="mb-3 text-sm text-gray-500 dark:text-neutral-400">{t("count", { count: data.length })}</p>
      <FrpFilters onGlobalFilterChange={setSearch} />
      <MaterialsTable
        data={data}
        columns={COLUMNS}
        globalFilter={search}
        onGlobalFilterChange={setSearch}
        renderRowActions={(row) => (
          <div className="flex items-center justify-end gap-1">
            <button type="button" title={t("actions.edit")} onClick={() => setEditingRow(row)} className={ROW_ACTION_CLS}>
              <Pencil className="h-4 w-4" />
            </button>
            <button type="button" title={t("actions.issue")} onClick={() => setIssuingRow(row)} className={ROW_ACTION_CLS}>
              <PackageMinus className="h-4 w-4" />
            </button>
          </div>
        )}
      />

      <EditMaterialPanel row={editingRow} open={Boolean(editingRow)} onOpenChange={(open) => !open && setEditingRow(null)} />
      <IssueMaterialPanel row={issuingRow} open={Boolean(issuingRow)} onOpenChange={(open) => !open && setIssuingRow(null)} />
    </div>
  );
}
