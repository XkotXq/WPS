"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useLocalStorage } from "usehooks-ts";
import { Plus, Pencil, PackageMinus, Search, Download, ChevronDown, ChevronRight, Layers, List, Filter, Package, Boxes, Tags, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToastStack, useToastStack } from "@/components/ui/toast";
import BulkReceiveGrid, { newBulkReceiveRow } from "@/components/BulkReceiveGrid";
import { downloadStockXlsx } from "@/lib/xlsxExport";
import { SM_INITIAL_ITEMS } from "@/lib/smMaterialsSeed";
import { getCipSession } from "@/lib/cipSession";
import { SM_HISTORY_LIMIT, SM_HISTORY_SEED, SM_HISTORY_STORAGE_KEY, makeSmHistoryId } from "@/lib/smOperationHistory";
import { SM_CATALOG_SEED, SM_CATALOG_STORAGE_KEY } from "@/lib/smMaterialsCatalog";
import { sanitizeQuantityInput } from "@/lib/quantityInput";

// Mock "Materiały SM" seed data (moved to lib/smMaterialsSeed.js) - see
// SM_INITIAL_ITEMS there for what this concept demonstrates and where the
// data came from.
const INITIAL_ITEMS = SM_INITIAL_ITEMS;

// No unit suffix is stored (km/kg) - everyone already knows which unit a
// given material uses, so quantities are plain numbers throughout.
function sumQuantity(units) {
  if (!units.length) return "-";
  const total = units.reduce((sum, u) => sum + (parseFloat(u.quantity) || 0), 0);
  return total % 1 === 0 ? String(total) : total.toFixed(3);
}

// The single number an item's "Ilość" column represents, regardless of
// whether it's a sum of units or a standalone total - used by the quantity
// range table filter.
function itemQuantityValue(item) {
  return parseFloat(item.trackedIndividually ? totalQuantityForItem(item) : item.totalQuantity);
}

// pendingQuantity is the "Przyjęcie zamówienia" (order receipt) half of
// the two-phase workflow: quantity already on hand and already counted -
// see AGENTS.md - just not yet split into individually-numbered spools.
// Kept as its own field (rather than a fake unit) so an item can carry
// real units *and* an unassigned remainder at the same time (e.g. a new
// order for an item that already has labeled spools from a previous one).
function hasPendingQuantity(item) {
  return (parseFloat(item.pendingQuantity) || 0) > 0;
}

// Same "Ilość" total sumQuantity(item.units) would give, but also
// counting pendingQuantity - so the group row's total always reflects
// everything actually on hand, labeled or not.
function totalQuantityForItem(item) {
  const unitsTotal = item.units.reduce((sum, u) => sum + (parseFloat(u.quantity) || 0), 0);
  const total = unitsTotal + (parseFloat(item.pendingQuantity) || 0);
  return total % 1 === 0 ? String(total) : total.toFixed(3);
}


const FIELD_CLS =
  "h-10 w-full rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-neutral-100 focus:border-navy-700 dark:focus:border-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400 disabled:cursor-not-allowed disabled:border-gray-100 disabled:bg-gray-100 disabled:text-gray-400 dark:disabled:border-neutral-800 dark:disabled:bg-neutral-900 dark:disabled:text-neutral-600";
const LABEL_CLS = "text-xs font-medium text-gray-500 dark:text-neutral-400";
const ROW_ACTION_CLS =
  "rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200";

// Same footprint as the expand/collapse chevron (h-3.5 w-3.5), rendered
// alone in its own leading table cell (see the dedicated chevron column,
// grouped view only) so every row's cell in that column is the same size
// whether or not that particular row actually has a chevron to show -
// inline-block (not the default inline) so the explicit size actually
// takes effect without needing a flex wrapper around it.
function ChevronSpacer() {
  return <span className="inline-block h-3.5 w-3.5" />;
}

// Pure (module-level, not component-closure) so BodyRow below can stay a
// plain memoized component - once a column has been narrowed, its cells
// need to actually wrap instead of relying on the table's default nowrap
// (see the table-layout:fixed comment on startResize for why plain
// wrapping alone doesn't let the column narrow in the first place). Nazwa
// also gets a 5-line clamp so a very long material name trails off with
// "…" instead of growing the row indefinitely.
function wrapCls(columnSizing, columnId) {
  return columnSizing[columnId] ? "whitespace-normal break-words" : "";
}
function nameCls(columnSizing) {
  return columnSizing.itemName ? "line-clamp-5 whitespace-normal break-words" : "";
}

// Keeps the Edytuj/Wydaj icons on screen when a resized table scrolls
// horizontally - sticky right-0, same trick as MaterialsTable.js's own
// actions column. Needs a fully *opaque* background per row state
// (rather than inheriting the row's own hover/selected classes, which can
// be semi-transparent) since a sticky cell renders pinned above whatever
// scrolled out from underneath it - see AGENTS.md.
function actionsCellCls(isSelected) {
  return `sticky right-0 z-10 border-l border-gray-100 dark:border-neutral-800 group-hover:!bg-gray-200 dark:group-hover:!bg-neutral-800 ${
    isSelected ? "!bg-gray-100 dark:!bg-neutral-800" : "bg-white dark:bg-neutral-900"
  }`;
}

// Read-only recap of the row an edit/issue panel is acting on.
function UnitInfo({ row, t }) {
  return (
    <div className="rounded-lg border border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/50 p-3 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        <dt className="text-gray-500 dark:text-neutral-400">{t("columns.itemNo")}</dt>
        <dd className="font-medium text-gray-900 dark:text-neutral-100">{row.itemNo}</dd>
        <dt className="text-gray-500 dark:text-neutral-400">{t("columns.itemName")}</dt>
        <dd className="font-medium text-gray-900 dark:text-neutral-100">{row.itemName}</dd>
        {row.unitId && (
          <>
            <dt className="text-gray-500 dark:text-neutral-400">{t("columns.unitId")}</dt>
            <dd className="font-medium text-gray-900 dark:text-neutral-100">{row.unitId}</dd>
          </>
        )}
        {row.quantity !== undefined && (
          <>
            <dt className="text-gray-500 dark:text-neutral-400">{t("columns.quantity")}</dt>
            <dd className="font-medium text-gray-900 dark:text-neutral-100">{row.quantity}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

// Mock "add receipt" form - the two-write idea discussed for this screen:
// on a real save this would (1) push item/quantity/location to CIP through
// its API and (2) keep the unit number here, since CIP has nowhere to put
// it. For now it only updates local state, to demo the flow.
function ReceiveUnitPanel({ open, onOpenChange, onCreate, onReceiveOrder, items, catalog, t }) {
  const [itemNo, setItemNo] = useState("");
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [location, setLocation] = useState("");
  const [unitId, setUnitId] = useState("");
  const [receiveMode, setReceiveMode] = useState("single");
  const [bulkRows, setBulkRows] = useState(() => [newBulkReceiveRow(), newBulkReceiveRow(), newBulkReceiveRow()]);

  useEffect(() => {
    if (!open) return;
    setItemNo("");
    setItemName("");
    setQuantity("");
    setLocation("");
    setUnitId("");
    setReceiveMode("single");
    setBulkRows([newBulkReceiveRow(), newBulkReceiveRow(), newBulkReceiveRow()]);
  }, [open]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!itemNo.trim() || !itemName.trim() || !quantity.trim() || !unitId.trim()) return;
    onCreate({
      id: `u-${Date.now()}`,
      unitType: "spool",
      itemNo: itemNo.trim(),
      itemName: itemName.trim(),
      unitId: unitId.trim(),
      quantity: quantity.trim(),
      locationCode: location.trim() || "MT",
    });
    onOpenChange(false);
  }

  // Only rows with every required field filled in count - a half-typed
  // trailing row (e.g. from "+ Dodaj wiersz") is silently skipped rather
  // than blocking the whole save. No unitId here - an order line is a
  // plain item+quantity, same shape as the real order list this mirrors;
  // spool numbers get assigned later (see AssignSpoolNumbersPanel).
  const validOrderEntries = bulkRows
    .filter((row) => row.itemNo.trim() && row.itemName.trim() && row.quantity.trim() && row.location.trim())
    .map((row) => ({
      itemNo: row.itemNo.trim(),
      itemName: row.itemName.trim(),
      quantity: row.quantity.trim(),
      locationCode: row.location.trim(),
    }));

  // A row the user has started (typed anything into it) must have both
  // Ilość and Lokalizacja before the order can be saved - unlike a fully
  // untouched trailing row (silently skipped by validOrderEntries above),
  // a half-filled one blocks Zapisz instead of quietly dropping data the
  // user meant to include.
  const incompleteBulkRows = bulkRows.some(
    (row) =>
      (row.itemNo.trim() || row.itemName.trim() || row.quantity.trim() || row.location.trim()) &&
      (!row.quantity.trim() || !row.location.trim())
  );

  function handleBulkSubmit() {
    if (validOrderEntries.length === 0 || incompleteBulkRows) return;
    onReceiveOrder(validOrderEntries);
    onOpenChange(false);
  }

  // Looked up against materials already known to this page - current
  // stock first (items), then the reference catalog (Katalog materiałów
  // SM, see lib/smMaterialsCatalog.js) so a material still resolves once
  // every unit of it has already been issued and it's no longer on the
  // stock list itself. There's no real backend endpoint for this yet (see
  // AGENTS.md), so this stands in for one until it exists. Shared by the
  // single-receipt form below (on blur) and the bulk order-receipt grid
  // (on leaving the itemNo cell - see BulkReceiveGrid's onLookupItemName).
  function lookupItemName(rawItemNo) {
    const trimmed = rawItemNo.trim();
    if (!trimmed) return undefined;
    const match =
      items.find((it) => it.itemNo.toLowerCase() === trimmed.toLowerCase()) ??
      catalog.find((it) => it.itemNo.toLowerCase() === trimmed.toLowerCase());
    return match?.itemName;
  }

  // Auto-fills the name once the user leaves the item-number field.
  function handleItemNoBlur() {
    const match = lookupItemName(itemNo);
    if (match) setItemName(match);
  }

  // Escape is how AG Grid cancels an in-progress cell edit - without this,
  // the same keypress also bubbles up to Base UI's own Escape-closes-dialog
  // handling and the whole bulk grid (every typed row) disappears with it.
  // Only intercepted in bulk mode; single mode has no grid fighting for
  // that key, so Escape closes the dialog as normal there.
  function handleOpenChange(nextOpen, eventDetails) {
    if (!nextOpen && eventDetails?.reason === "escape-key" && receiveMode === "bulk") {
      eventDetails.cancel();
      return;
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Wide enough that the grid's 4 columns (itemNo 170 + itemName 260 +
        quantity 100 + location 120 = 650px) plus its checkbox row-marker
        column fit without the grid's own horizontal scrollbar - max-w-2xl
        (672px minus the dialog's p-5 padding) was too narrow and clipped
        the last column. */}
      <DialogContent className={receiveMode === "bulk" ? "max-w-4xl" : undefined}>
        <DialogHeader>
          <DialogTitle>{t("receivePanel.title")}</DialogTitle>
        </DialogHeader>

        <div className="inline-flex items-center gap-1 self-start rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-100 dark:bg-neutral-800 p-1">
          <button
            type="button"
            onClick={() => setReceiveMode("single")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              receiveMode === "single"
                ? "bg-white text-navy-950 shadow-sm dark:bg-neutral-900 dark:text-white"
                : "text-gray-500 hover:text-gray-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            }`}
          >
            <Package className="h-4 w-4" />
            {t("receivePanel.modeSingle")}
          </button>
          <button
            type="button"
            onClick={() => setReceiveMode("bulk")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              receiveMode === "bulk"
                ? "bg-white text-navy-950 shadow-sm dark:bg-neutral-900 dark:text-white"
                : "text-gray-500 hover:text-gray-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            }`}
          >
            <Boxes className="h-4 w-4" />
            {t("receivePanel.modeBulk")}
          </button>
        </div>

        {receiveMode === "bulk" && (
          <BulkReceiveGrid
            rows={bulkRows}
            onChange={setBulkRows}
            onAddRow={() => setBulkRows((prev) => [...prev, newBulkReceiveRow()])}
            onLookupItemName={lookupItemName}
            t={t}
          />
        )}

        {receiveMode === "single" && (
        <form id="receive-unit-form" onSubmit={handleSubmit} className="flex flex-1 flex-col gap-3 overflow-y-auto">
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>{t("receivePanel.itemNoLabel")}</span>
            <input className={FIELD_CLS} value={itemNo} onChange={(e) => setItemNo(e.target.value)} onBlur={handleItemNoBlur} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>{t("receivePanel.itemNameLabel")}</span>
            <input className={FIELD_CLS} value={itemName} onChange={(e) => setItemName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>{t("receivePanel.quantityLabel")}</span>
            <input
              className={FIELD_CLS}
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(sanitizeQuantityInput(e.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>{t("receivePanel.locationLabel")}</span>
            <input className={FIELD_CLS} placeholder="MT" value={location} onChange={(e) => setLocation(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>{t("receivePanel.unitIdLabel")}</span>
            <input
              className={FIELD_CLS}
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
            />
          </label>
        </form>
        )}
        {receiveMode === "bulk" && incompleteBulkRows && (
          <p className="text-xs text-red-600 dark:text-red-400">{t("receivePanel.incompleteRows")}</p>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("receivePanel.cancel")}
          </Button>
          <Button
            type={receiveMode === "single" ? "submit" : "button"}
            form={receiveMode === "single" ? "receive-unit-form" : undefined}
            size="sm"
            disabled={receiveMode === "bulk" && (validOrderEntries.length === 0 || incompleteBulkRows)}
            onClick={receiveMode === "bulk" ? handleBulkSubmit : undefined}
          >
            {t("receivePanel.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUnitPanel({ row, open, onOpenChange, onSave, onDelete, t }) {
  const [itemName, setItemName] = useState("");
  const [unitId, setUnitId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const hasUnitId = row?.kind === "unit";
  const hasQuantity = row?.kind === "unit" || row?.kind === "aggregate" || row?.kind === "pending";
  const canDelete = Boolean(row?.isZero);

  useEffect(() => {
    if (!row) return;
    setItemName(row.itemName);
    setUnitId(row.unitId ?? "");
    setQuantity(row.quantity ?? "");
    setNote(row.note && row.note !== "-" ? row.note : "");
  }, [row]);

  if (!row) return null;

  function handleSubmit(e) {
    e.preventDefault();
    const patch = { itemName, note: note.trim() || "-" };
    if (hasUnitId) patch.unitId = unitId;
    if (hasQuantity) patch.quantity = quantity;
    onSave(row, patch);
    onOpenChange(false);
  }

  // Only offered for a whole material (aggregate/groupParent) sitting at
  // 0 - see `isZero` on those rows' actionRow/itemEditRow in BodyRow. Stays
  // open if the confirm prompt inside onDelete is cancelled (it reports
  // back whether the delete actually happened).
  function handleDeleteClick() {
    if (onDelete(row)) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editPanel.title")}</DialogTitle>
        </DialogHeader>

        <form id="edit-unit-form" onSubmit={handleSubmit} className="flex flex-1 flex-col gap-3 overflow-y-auto">
          <UnitInfo row={row} t={t} />

          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>{t("columns.itemName")}</span>
            <input className={`${FIELD_CLS} disabled:opacity-60`} value={itemName} disabled />
          </label>
          {hasUnitId && (
            <label className="flex flex-col gap-1">
              <span className={LABEL_CLS}>{t("columns.unitId")}</span>
              <input className={FIELD_CLS} value={unitId} onChange={(e) => setUnitId(e.target.value)} />
            </label>
          )}
          {hasQuantity && (
            <label className="flex flex-col gap-1">
              <span className={LABEL_CLS}>{t("columns.quantity")}</span>
              <input
                className={FIELD_CLS}
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(sanitizeQuantityInput(e.target.value))}
              />
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>{t("notePanel.noteLabel")}</span>
            <textarea
              className={`${FIELD_CLS} h-20 resize-none py-2`}
              placeholder={t("notePanel.placeholder")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
        </form>

        <DialogFooter className={canDelete ? "justify-between" : undefined}>
          {canDelete && (
            <Button type="button" variant="destructive" size="sm" className="gap-1.5" onClick={handleDeleteClick}>
              <Trash2 className="h-4 w-4" />
              {t("editPanel.delete")}
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t("editPanel.cancel")}
            </Button>
            <Button type="submit" form="edit-unit-form" size="sm">
              {t("editPanel.save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Every material's issue quantity is editable here, prefilled with its
// full available amount (same as IssueGroupPanel's per-unit inputs) so
// the common case - issue everything - needs no typing, but can be
// lowered to issue only part of it.
function IssueUnitPanel({ row, open, onOpenChange, onIssue, t }) {
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!row) return;
    setQuantity(String(row.quantity ?? ""));
    setError("");
  }, [row]);

  if (!row) return null;

  function handleConfirm() {
    const available = parseFloat(row.quantity);
    const value = parseFloat(quantity.trim().replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      setError(t("issuePanel.requiredQuantity"));
      return;
    }
    if (value > available) {
      setError(t("issuePanel.maxQuantity", { max: row.quantity }));
      return;
    }
    onIssue(row, quantity.trim());
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("issuePanel.title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
          <div className="overflow-hidden rounded-md border border-gray-200 dark:border-neutral-700">
            <dl className="divide-y divide-gray-100 dark:divide-neutral-800">
              <div className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
                <dt className="text-gray-500 dark:text-neutral-400">{t("columns.itemName")}</dt>
                <dd className="font-medium text-gray-900 dark:text-neutral-100">{row.itemName}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
                <dt className="text-gray-500 dark:text-neutral-400">{t("columns.itemNo")}</dt>
                <dd className="font-medium text-gray-900 dark:text-neutral-100">{row.itemNo}</dd>
              </div>
              {row.unitId && (
                <div className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
                  <dt className="text-gray-500 dark:text-neutral-400">{t("columns.unitId")}</dt>
                  <dd className="font-mono font-medium text-gray-900 dark:text-neutral-100">{row.unitId}</dd>
                </div>
              )}
              {row.productBatch && (
                <div className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
                  <dt className="text-gray-500 dark:text-neutral-400">{t("columns.productBatch")}</dt>
                  <dd className="font-medium text-gray-900 dark:text-neutral-100">{row.productBatch}</dd>
                </div>
              )}
              {row.note && row.note !== "-" && (
                <div className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
                  <dt className="text-gray-500 dark:text-neutral-400">{t("notePanel.noteLabel")}</dt>
                  <dd className="text-right font-medium text-gray-900 dark:text-neutral-100">{row.note}</dd>
                </div>
              )}
            </dl>
          </div>

          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>{t("issuePanel.quantityLabel")}</span>
            <div className="flex items-center gap-2">
              <span className="shrink-0 tabular-nums text-sm font-medium text-gray-900 dark:text-neutral-100">{row.quantity}</span>
              <span className="shrink-0 text-gray-400 dark:text-neutral-500">/</span>
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                placeholder={row.quantity}
                value={quantity}
                onChange={(e) => setQuantity(sanitizeQuantityInput(e.target.value))}
                className={`${FIELD_CLS} flex-1 min-w-0`}
              />
            </div>
            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("issuePanel.cancel")}
          </Button>
          <Button size="sm" onClick={handleConfirm}>
            {t("issuePanel.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Batched sibling of IssueUnitPanel - the group row's own "Wydaj" lets you
// pick any number of that item's units from a checklist and issue them all
// at once, instead of opening each unit's own issue panel one at a time.
function IssueGroupPanel({ item, open, onOpenChange, onIssue, t }) {
  const [selected, setSelected] = useState(() => new Set());
  // Every unit's own quantity is prefilled here (unlike IssueUnitPanel's
  // blank single-unit input) - a group listing already shows each unit's
  // full amount as plain text, so defaulting the input to that same value
  // costs nothing and still lets a partial amount be typed instead.
  const [quantities, setQuantities] = useState({});
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!item) return;
    setSelected(new Set());
    setQuantities(Object.fromEntries(item.units.map((u) => [u.id, String(u.quantity)])));
    setErrors({});
  }, [item]);

  if (!item) return null;

  function toggleUnit(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = item.units.length > 0 && selected.size === item.units.length;

  function toggleAll(checked) {
    setSelected(checked ? new Set(item.units.map((u) => u.id)) : new Set());
  }

  function setQuantity(id, value) {
    setQuantities((prev) => ({ ...prev, [id]: sanitizeQuantityInput(value) }));
    setErrors((prev) => (prev[id] ? { ...prev, [id]: undefined } : prev));
  }

  function handleConfirm() {
    const nextErrors = {};
    selected.forEach((id) => {
      const u = item.units.find((unit) => unit.id === id);
      const value = parseFloat((quantities[id] ?? "").trim().replace(",", "."));
      const available = parseFloat(u.quantity);
      if (!Number.isFinite(value) || value <= 0) nextErrors[id] = t("issuePanel.requiredQuantity");
      else if (value > available) nextErrors[id] = t("issuePanel.maxQuantity", { max: u.quantity });
    });
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    onIssue(item, [...selected].map((id) => ({ id, quantity: quantities[id].trim() })));
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("issueGroupPanel.title")}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
          <div className="rounded-lg border border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/50 p-3 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
              <dt className="text-gray-500 dark:text-neutral-400">{t("columns.itemNo")}</dt>
              <dd className="font-medium text-gray-900 dark:text-neutral-100">{item.itemNo}</dd>
              <dt className="text-gray-500 dark:text-neutral-400">{t("columns.itemName")}</dt>
              <dd className="font-medium text-gray-900 dark:text-neutral-100">{item.itemName}</dd>
            </dl>
          </div>

          <label className="flex items-center gap-2 border-b border-gray-100 dark:border-neutral-800 pb-2 text-sm font-medium text-gray-600 dark:text-neutral-300">
            <Checkbox checked={allSelected} onCheckedChange={(value) => toggleAll(Boolean(value))} />
            {t("issueGroupPanel.selectAll")}
          </label>

          <div className="flex flex-col gap-1">
            {item.units.map((u) => (
              <div key={u.id} className="flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-gray-50 dark:hover:bg-neutral-800">
                <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-neutral-200">
                  <Checkbox checked={selected.has(u.id)} onCheckedChange={() => toggleUnit(u.id)} />
                  <span className="font-medium">{u.unitId}</span>
                </label>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="tabular-nums text-sm text-gray-400 dark:text-neutral-500">{u.quantity}</span>
                    <span className="text-gray-300 dark:text-neutral-600">/</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={quantities[u.id] ?? ""}
                      onChange={(e) => setQuantity(u.id, e.target.value)}
                      className={`${FIELD_CLS.replace("w-full", "w-20").replace("px-3", "px-1")} h-9 text-right`}
                    />
                  </div>
                  {errors[u.id] && <p className="text-xs text-red-600 dark:text-red-400">{errors[u.id]}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("issuePanel.cancel")}
          </Button>
          <Button size="sm" disabled={selected.size === 0} onClick={handleConfirm}>
            {t("issueGroupPanel.confirm", { count: selected.size })}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// Second half of the two-phase order workflow (see AGENTS.md): "Przyjęcie
// zamówienia" (ReceiveUnitPanel's bulk mode) records the aggregate quantity
// from the morning order the moment it's added to CIP - that's real stock,
// already on hand, just not yet split into individually-numbered spools.
// This panel does that split, once the physical spools are labeled: add one
// spool (its number + the length printed on its own label) at a time,
// tracking how much of the item's pendingQuantity is still unassigned.
// Saving converts each added row into a real unit (same shape handleCreate
// produces) and shrinks pendingQuantity by what was just assigned - it does
// NOT add new stock, since that quantity was already counted at order-
// receipt time (see handleAssignUnits).
function AssignSpoolNumbersPanel({ item, open, onOpenChange, onAssign, t }) {
  const [draftRows, setDraftRows] = useState([]);
  const [unitId, setUnitId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState("");
  const unitIdInputRef = useRef(null);

  useEffect(() => {
    if (!item) return;
    setDraftRows([]);
    setUnitId("");
    setQuantity("");
    setError("");
  }, [item]);

  if (!item) return null;

  const pending = parseFloat(item.pendingQuantity) || 0;
  const draftTotal = draftRows.reduce((sum, row) => sum + (parseFloat(row.quantity) || 0), 0);
  const remaining = pending - draftTotal;
  const remainingFormatted = remaining % 1 === 0 ? String(remaining) : remaining.toFixed(3);

  function handleAddRow(e) {
    e.preventDefault();
    if (!unitId.trim() || !quantity.trim()) return;
    // Blocks the over-assignment at its source (typing a spool's length)
    // rather than only flagging it after the fact - remaining is already
    // this row's own quantity subtracted out of pending, so comparing
    // against it directly catches "more than what's left" with a tiny
    // epsilon for float rounding (e.g. 0.1 + 0.2 quantities).
    const value = parseFloat(quantity.trim().replace(",", "."));
    if (value - remaining > 0.0005) {
      setError(t("assignPanel.exceedsRemaining", { remaining: remainingFormatted }));
      return;
    }
    setDraftRows((prev) => [...prev, { id: `draft-${Date.now()}`, unitId: unitId.trim(), quantity: quantity.trim() }]);
    setUnitId("");
    setQuantity("");
    setError("");
    unitIdInputRef.current?.focus();
  }

  function handleRemoveRow(id) {
    setDraftRows((prev) => prev.filter((row) => row.id !== id));
  }

  function handleSave() {
    if (draftRows.length === 0) {
      setError(t("assignPanel.empty"));
      return;
    }
    if (remaining < 0) return;
    onAssign(item, draftRows);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("assignPanel.title")}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
          <div className="rounded-lg border border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/50 p-3 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
              <dt className="text-gray-500 dark:text-neutral-400">{t("columns.itemNo")}</dt>
              <dd className="font-medium text-gray-900 dark:text-neutral-100">{item.itemNo}</dd>
              <dt className="text-gray-500 dark:text-neutral-400">{t("columns.itemName")}</dt>
              <dd className="font-medium text-gray-900 dark:text-neutral-100">{item.itemName}</dd>
              <dt className="text-gray-500 dark:text-neutral-400">{t("assignPanel.remainingLabel")}</dt>
              <dd className={`font-medium tabular-nums ${remaining < 0 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-neutral-100"}`}>
                {remainingFormatted}
              </dd>
            </dl>
          </div>
          {remaining < 0 && (
            <p className="text-xs text-red-600 dark:text-red-400">{t("assignPanel.overAssigned", { quantity: Math.abs(remaining).toFixed(3) })}</p>
          )}

          <form onSubmit={handleAddRow} className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className={LABEL_CLS}>{t("assignPanel.unitIdLabel")}</span>
              <input ref={unitIdInputRef} className={FIELD_CLS} value={unitId} onChange={(e) => setUnitId(e.target.value)} autoFocus />
            </label>
            <label className="flex w-28 flex-col gap-1">
              <span className={LABEL_CLS}>{t("assignPanel.quantityLabel")}</span>
              <input
                className={FIELD_CLS}
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(sanitizeQuantityInput(e.target.value))}
              />
            </label>
            <Button type="submit" variant="outline" size="sm" className="h-10">
              {t("assignPanel.addRow")}
            </Button>
          </form>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

          {draftRows.length > 0 && (
            <div className="flex flex-col gap-1">
              {draftRows.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 dark:bg-neutral-800/50 px-3 py-1.5 text-sm"
                >
                  <span className="font-medium text-gray-900 dark:text-neutral-100">{row.unitId}</span>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-gray-600 dark:text-neutral-300">{row.quantity}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(row.id)}
                      className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:text-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
                      title={t("assignPanel.removeRow")}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <SheetFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("assignPanel.cancel")}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={remaining < 0}>
            {t("assignPanel.save")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// Cross-item bulk issue - the toolbar's "Wydaj zaznaczone" opens this for
// whatever leaf rows (units and/or whole aggregate items) are checked
// across the table, regardless of which item they belong to. A unit row
// has no partial concept (same rule as IssueUnitPanel), so its input just
// displays the full quantity, disabled; an aggregate row's input starts
// empty and, left blank, issues the full remaining amount too - typing a
// smaller number issues only that much, same validation as the single-row
// panel.
function BulkIssuePanel({ rows, open, onOpenChange, onIssue, t }) {
  const [quantities, setQuantities] = useState({});
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    // Unit rows (a single spool/bigbag) are prefilled with their full
    // quantity so the input still shows what will be issued if left
    // untouched; aggregate rows (a combined quantity that can be issued
    // partially) start empty so the user types how much to issue - leaving
    // it empty still issues the full available amount (see handleConfirm).
    setQuantities(Object.fromEntries(rows.filter((row) => row.kind !== "aggregate").map((row) => [row.id, String(row.quantity)])));
    setErrors({});
  }, [open, rows]);

  function setQuantity(id, value) {
    setQuantities((prev) => ({ ...prev, [id]: sanitizeQuantityInput(value) }));
    setErrors((prev) => (prev[id] ? { ...prev, [id]: undefined } : prev));
  }

  function handleConfirm() {
    const nextErrors = {};
    rows.forEach((row) => {
      const raw = (quantities[row.id] ?? "").trim();
      if (!raw) return;
      const value = parseFloat(raw.replace(",", "."));
      const available = parseFloat(row.quantity);
      if (!Number.isFinite(value) || value <= 0) nextErrors[row.id] = t("issuePanel.requiredQuantity");
      else if (value > available) nextErrors[row.id] = t("issuePanel.maxQuantity", { max: row.quantity });
    });
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    onIssue(rows.map((row) => ({ row, quantity: quantities[row.id]?.trim() || undefined })));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[67.2rem]">
        <DialogHeader>
          <DialogTitle>{t("bulkIssuePanel.title")}</DialogTitle>
        </DialogHeader>

        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-neutral-800">
          <Table containerClassName="max-h-[50vh] overflow-y-auto">
            <TableHeader>
              <TableRow className="border-b border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800">
                <TableHead className="sticky top-0 z-10 bg-gray-50 pl-4 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:bg-neutral-800 dark:text-neutral-500">
                  {t("columns.itemNo")}
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-gray-50 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:bg-neutral-800 dark:text-neutral-500">
                  {t("columns.itemName")}
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-gray-50 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:bg-neutral-800 dark:text-neutral-500">
                  {t("columns.unitId")}
                </TableHead>
                <TableHead className="sticky top-0 z-10 bg-gray-50 pr-4 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:bg-neutral-800 dark:text-neutral-500">
                  {t("issuePanel.quantityLabel")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="pl-4 text-gray-600 dark:text-neutral-300">{row.itemNo}</TableCell>
                  <TableCell className="text-gray-600 dark:text-neutral-300">{row.itemName}</TableCell>
                  <TableCell className="text-gray-600 dark:text-neutral-300">
                    {row.unitId ?? <span className="text-gray-400 dark:text-neutral-500">-</span>}
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="tabular-nums text-sm text-gray-700 dark:text-neutral-200">{row.quantity}</span>
                      <span className="text-gray-300 dark:text-neutral-600">/</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={quantities[row.id] ?? ""}
                        onChange={(e) => setQuantity(row.id, e.target.value)}
                        className={`${FIELD_CLS.replace("w-full", "w-20").replace("px-3", "px-1")} h-9 text-right`}
                      />
                    </div>
                    {errors[row.id] && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors[row.id]}</p>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("issuePanel.cancel")}
          </Button>
          <Button size="sm" onClick={handleConfirm}>
            {t("bulkIssuePanel.confirm", { count: rows.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// One case per bodyRows entry kind (see the useMemo below). Memoized with
// a comparator that only looks at the data that actually determines what
// this specific row renders (row.item/row.unit by reference - stable
// across re-renders unless *that* item's own data changed - plus the few
// booleans that affect just this row) and deliberately ignores the
// callback props (onEdit/onIssue/etc.) and `t`: those get a new function
// identity every render of the parent but only ever capture stable
// setState functions, so treating them as always-equal is safe. This is
// the same trick stock/src/components/MaterialRow.jsx uses - selecting or
// expanding one row no longer re-renders every other row in the table,
// which is what made both actions feel sluggish once this list grew past
// a couple hundred entries. Deliberately NOT virtualized (no windowing):
// with a plain overflow-y-auto container, this list is small enough that
// native scrolling is already free, and virtualizing it made *scrolling
// itself* noticeably janky (relayout on every scroll frame to resize the
// spacer rows) for no benefit - memoizing what actually re-renders on
// click is the right amount of optimization at this size, not windowing.
const BodyRow = memo(function BodyRow({
  row,
  isSelected,
  isGroupOpen,
  itemAllSelected,
  itemSomeSelected,
  viewMode,
  columnSizing,
  t,
  onToggleSelect,
  onToggleItemSelect,
  onToggleItem,
  onEdit,
  onIssue,
  onIssueGroup,
  onAssignUnits,
}) {
  if (row.kind === "aggregate") {
    const item = row.item;
    const isGrouped = viewMode === "grouped";
    const isZero = !(parseFloat(item.totalQuantity) > 0);
    const actionRow = { kind: "aggregate", id: item.itemNo, itemNo: item.itemNo, itemName: item.itemName, quantity: item.totalQuantity, note: item.note, isZero };
    return (
      <TableRow className="group" data-state={isSelected ? "selected" : undefined}>
        {isGrouped && (
          <TableCell className="w-8 pl-8">
            <ChevronSpacer />
          </TableCell>
        )}
        <TableCell className={isGrouped ? "" : "pl-8"}>
          <Checkbox checked={isSelected} onCheckedChange={(value) => onToggleSelect(item.itemNo, Boolean(value))} />
        </TableCell>
        <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "itemNo")}`}>{item.itemNo}</TableCell>
        <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "itemName")}`}>
          <span className={nameCls(columnSizing)}>{item.itemName}</span>
        </TableCell>
        {viewMode === "flat" && <TableCell className="text-gray-400 dark:text-neutral-500">-</TableCell>}
        <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "quantity")}`}>{item.totalQuantity}</TableCell>
        <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "location")}`}>{item.locationCode}</TableCell>
        <TableCell className={`text-gray-400 dark:text-neutral-500 ${wrapCls(columnSizing, "note")}`}>{item.note}</TableCell>
        <TableCell className={`pr-4 ${actionsCellCls(isSelected)}`}>
          <div className="flex items-center justify-end gap-1">
            <button type="button" title={t("actions.edit")} onClick={() => onEdit(actionRow)} className={ROW_ACTION_CLS}>
              <Pencil className="h-4 w-4" />
            </button>
            <button type="button" title={t("actions.issue")} onClick={() => onIssue(actionRow)} className={ROW_ACTION_CLS}>
              <PackageMinus className="h-4 w-4" />
            </button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  if (row.kind === "flatUnit") {
    const { item, unit: u } = row;
    const actionRow = { kind: "unit", id: u.id, itemNo: item.itemNo, itemName: item.itemName, unitId: u.unitId, productBatch: u.productBatch, quantity: u.quantity, note: u.note };
    return (
      <TableRow className="group" data-state={isSelected ? "selected" : undefined}>
        <TableCell className="pl-8">
          <Checkbox checked={isSelected} onCheckedChange={(value) => onToggleSelect(u.id, Boolean(value))} />
        </TableCell>
        <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "itemNo")}`}>{item.itemNo}</TableCell>
        <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "itemName")}`}>
          <span className={nameCls(columnSizing)}>{item.itemName}</span>
        </TableCell>
        <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "materialNumber")}`}>{u.unitId}</TableCell>
        <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "quantity")}`}>{u.quantity}</TableCell>
        <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "location")}`}>{item.locationCode}</TableCell>
        <TableCell className={`text-gray-400 dark:text-neutral-500 ${wrapCls(columnSizing, "note")}`}>{u.note}</TableCell>
        <TableCell className={`pr-4 ${actionsCellCls(isSelected)}`}>
          <div className="flex items-center justify-end gap-1">
            <button type="button" title={t("actions.edit")} onClick={() => onEdit(actionRow)} className={ROW_ACTION_CLS}>
              <Pencil className="h-4 w-4" />
            </button>
            <button type="button" title={t("actions.issue")} onClick={() => onIssue(actionRow)} className={ROW_ACTION_CLS}>
              <PackageMinus className="h-4 w-4" />
            </button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  if (row.kind === "singleUnit") {
    const { item, unit: u } = row;
    const actionRow = { kind: "unit", id: u.id, itemNo: item.itemNo, itemName: item.itemName, unitId: u.unitId, productBatch: u.productBatch, quantity: u.quantity, note: u.note };
    return (
      <TableRow className="group" data-state={isSelected ? "selected" : undefined}>
        <TableCell className="w-8 pl-8">
          <ChevronSpacer />
        </TableCell>
        <TableCell>
          <Checkbox checked={isSelected} onCheckedChange={(value) => onToggleSelect(u.id, Boolean(value))} />
        </TableCell>
        <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "itemNo")}`}>{item.itemNo}</TableCell>
        <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "itemName")}`}>
          <span className="inline-flex items-baseline gap-1.5">
            <span className={nameCls(columnSizing)}>{item.itemName}</span>
            <span className="shrink-0 text-xs font-medium text-gray-400 dark:text-neutral-500">{u.unitId}</span>
          </span>
        </TableCell>
        <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "quantity")}`}>{u.quantity}</TableCell>
        <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "location")}`}>{item.locationCode}</TableCell>
        <TableCell className={`text-gray-400 dark:text-neutral-500 ${wrapCls(columnSizing, "note")}`}>{u.note}</TableCell>
        <TableCell className={`pr-4 ${actionsCellCls(isSelected)}`}>
          <div className="flex items-center justify-end gap-1">
            <button type="button" title={t("actions.edit")} onClick={() => onEdit(actionRow)} className={ROW_ACTION_CLS}>
              <Pencil className="h-4 w-4" />
            </button>
            <button type="button" title={t("actions.issue")} onClick={() => onIssue(actionRow)} className={ROW_ACTION_CLS}>
              <PackageMinus className="h-4 w-4" />
            </button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  if (row.kind === "groupParent") {
    const item = row.item;
    const isZero = item.units.length === 0 && !hasPendingQuantity(item);
    const itemEditRow = { kind: "item", id: item.itemNo, itemNo: item.itemNo, itemName: item.itemName, note: item.note, isZero };
    return (
      <TableRow onClick={isZero ? undefined : () => onToggleItem(item.itemNo)} className={`group ${isZero ? "" : "cursor-pointer"}`}>
        <TableCell className="w-8 pl-8">
          {isZero ? (
            <ChevronSpacer />
          ) : isGroupOpen ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          )}
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={itemAllSelected}
            indeterminate={itemSomeSelected && !itemAllSelected}
            onCheckedChange={(value) => onToggleItemSelect(item, Boolean(value))}
          />
        </TableCell>
        <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "itemNo")}`}>{item.itemNo}</TableCell>
        <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "itemName")}`}>
          <span className={nameCls(columnSizing)}>{item.itemName}</span>
        </TableCell>
        <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "quantity")}`}>{totalQuantityForItem(item)}</TableCell>
        <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "location")}`}>{item.locationCode}</TableCell>
        <TableCell className={`text-gray-400 dark:text-neutral-500 ${wrapCls(columnSizing, "note")}`}>{item.note}</TableCell>
        <TableCell className={`pr-4 ${actionsCellCls(false)}`} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-1">
            <button type="button" title={t("actions.edit")} onClick={() => onEdit(itemEditRow)} className={ROW_ACTION_CLS}>
              <Pencil className="h-4 w-4" />
            </button>
            <button type="button" title={t("actions.issue")} onClick={() => onIssueGroup(item)} className={ROW_ACTION_CLS}>
              <PackageMinus className="h-4 w-4" />
            </button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  if (row.kind === "pendingChild") {
    const item = row.item;
    const pendingActionRow = { kind: "pending", id: `${item.itemNo}-pending`, itemNo: item.itemNo, itemName: item.itemName, quantity: item.pendingQuantity, note: item.note };
    return (
      <TableRow className="group">
        <TableCell className="relative w-8 pl-8">
          <span className="absolute inset-y-0 left-8 flex w-3.5 justify-center">
            <span className="h-full w-px bg-gray-300 dark:bg-neutral-600" />
          </span>
        </TableCell>
        <TableCell />
        <TableCell className={`pl-6 text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "itemNo")}`}>{t("pending.unitLabel")}</TableCell>
        <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "itemName")}`}>
          <span className={nameCls(columnSizing)}>{item.itemName}</span>
        </TableCell>
        <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "quantity")}`}>{item.pendingQuantity}</TableCell>
        <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "location")}`}>{item.locationCode}</TableCell>
        <TableCell className={`text-gray-400 dark:text-neutral-500 ${wrapCls(columnSizing, "note")}`}>{item.note}</TableCell>
        <TableCell className={`pr-4 ${actionsCellCls(false)}`}>
          <div className="flex items-center justify-end gap-1">
            <button type="button" title={t("actions.edit")} onClick={() => onEdit(pendingActionRow)} className={ROW_ACTION_CLS}>
              <Pencil className="h-4 w-4" />
            </button>
            <button type="button" title={t("actions.assign")} onClick={() => onAssignUnits(item)} className={ROW_ACTION_CLS}>
              <Tags className="h-4 w-4" />
            </button>
            <button type="button" title={t("actions.issue")} onClick={() => onIssue(pendingActionRow)} className={ROW_ACTION_CLS}>
              <PackageMinus className="h-4 w-4" />
            </button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  if (row.kind === "pendingRow") {
    const item = row.item;
    const pendingActionRow = { kind: "pending", id: `${item.itemNo}-pending`, itemNo: item.itemNo, itemName: item.itemName, quantity: item.pendingQuantity, note: item.note };
    return (
      <TableRow className="group">
        <TableCell className="pl-8" />
        <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "itemNo")}`}>{item.itemNo}</TableCell>
        <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "itemName")}`}>
          <span className={nameCls(columnSizing)}>{item.itemName}</span>
        </TableCell>
        <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "materialNumber")}`}>{t("pending.unitLabel")}</TableCell>
        <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "quantity")}`}>{item.pendingQuantity}</TableCell>
        <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "location")}`}>{item.locationCode}</TableCell>
        <TableCell className={`text-gray-400 dark:text-neutral-500 ${wrapCls(columnSizing, "note")}`}>{item.note}</TableCell>
        <TableCell className={`pr-4 ${actionsCellCls(false)}`}>
          <div className="flex items-center justify-end gap-1">
            <button type="button" title={t("actions.edit")} onClick={() => onEdit(pendingActionRow)} className={ROW_ACTION_CLS}>
              <Pencil className="h-4 w-4" />
            </button>
            <button type="button" title={t("actions.assign")} onClick={() => onAssignUnits(item)} className={ROW_ACTION_CLS}>
              <Tags className="h-4 w-4" />
            </button>
            <button type="button" title={t("actions.issue")} onClick={() => onIssue(pendingActionRow)} className={ROW_ACTION_CLS}>
              <PackageMinus className="h-4 w-4" />
            </button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  // groupChild
  const { item, unit: u } = row;
  const actionRow = { kind: "unit", id: u.id, itemNo: item.itemNo, itemName: item.itemName, unitId: u.unitId, quantity: u.quantity, note: u.note };
  return (
    <TableRow className="group" data-state={isSelected ? "selected" : undefined}>
      <TableCell className="relative w-8 pl-8">
        {/* Vertical tree line tying this unit back to its group's chevron
          above it - consecutive groupChild rows sit flush against each
          other, so the line reads as one continuous bracket down the
          whole open group instead of each unit looking like just another
          plain row (see tree.jpg for the look this is going for). */}
        <span className="absolute inset-y-0 left-8 flex w-3.5 justify-center">
          <span className="h-full w-px bg-gray-300 dark:bg-neutral-600" />
        </span>
      </TableCell>
      <TableCell>
        <Checkbox checked={isSelected} onCheckedChange={(value) => onToggleSelect(u.id, Boolean(value))} />
      </TableCell>
      <TableCell className={`pl-6 text-gray-700 dark:text-neutral-200 ${wrapCls(columnSizing, "itemNo")}`}>{u.unitId}</TableCell>
      <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "itemName")}`}>
        <span className={nameCls(columnSizing)}>{item.itemName}</span>
      </TableCell>
      <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "quantity")}`}>{u.quantity}</TableCell>
      <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "location")}`}>{item.locationCode}</TableCell>
      <TableCell className={`text-gray-400 dark:text-neutral-500 ${wrapCls(columnSizing, "note")}`}>{u.note}</TableCell>
      <TableCell className={`pr-4 ${actionsCellCls(isSelected)}`}>
        <div className="flex items-center justify-end gap-1">
          <button type="button" title={t("actions.edit")} onClick={() => onEdit(actionRow)} className={ROW_ACTION_CLS}>
            <Pencil className="h-4 w-4" />
          </button>
          <button type="button" title={t("actions.issue")} onClick={() => onIssue(actionRow)} className={ROW_ACTION_CLS}>
            <PackageMinus className="h-4 w-4" />
          </button>
        </div>
      </TableCell>
    </TableRow>
  );
},
(prev, next) =>
  prev.row.kind === next.row.kind &&
  prev.row.item === next.row.item &&
  prev.row.unit === next.row.unit &&
  prev.isSelected === next.isSelected &&
  prev.isGroupOpen === next.isGroupOpen &&
  prev.itemAllSelected === next.itemAllSelected &&
  prev.itemSomeSelected === next.itemSomeSelected &&
  prev.viewMode === next.viewMode &&
  prev.columnSizing === next.columnSizing &&
  prev.t === next.t
);

export default function SmMaterialsPanel() {
  const t = useTranslations("materialsListSm");
  const tActions = useTranslations("stock.actions");
  const tStock = useTranslations("stock");
  const [items, setItems] = useState(INITIAL_ITEMS);
  const [search, setSearch] = useState("");
  // Table filters: narrow the already-loaded items.
  const [columnFilters, setColumnFilters] = useState({ note: "", quantityMin: "", quantityMax: "" });
  // itemName is a bounded catalog field (same materials list, same shape as
  // "Nr itemu" on the CIP-backed table) so it gets a multiselect instead of
  // a plain substring filter - see CipMaterialsTable.js's COLUMNS comment.
  // undefined means "no filter, everything visible"; otherwise the set of
  // currently visible names.
  const [nameFilter, setNameFilter] = useState(undefined);
  const [nameFilterSearch, setNameFilterSearch] = useState("");
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [issuingRow, setIssuingRow] = useState(null);
  const [issuingGroup, setIssuingGroup] = useState(null);
  const [assigningItem, setAssigningItem] = useState(null);
  const [bulkIssueOpen, setBulkIssueOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { toasts, pushToast, dismissToast } = useToastStack();
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [expandedItems, setExpandedItems] = useState({});
  const [viewMode, setViewMode] = useState("grouped");
  const [columnSizing, setColumnSizing] = useState({});
  // Operation log feeding /materials-list-sm/history-sm (SmMaterialsHistoryTable
  // reads the same key) - see logOperation below for what gets written.
  const [, setOperationHistory] = useLocalStorage(SM_HISTORY_STORAGE_KEY, SM_HISTORY_SEED);
  // Read-only here - Katalog materiałów SM (/materials-list-sm/catalog-sm,
  // SmMaterialsCatalogTable) owns writing to this key; this page only
  // reads it, to autofill a material's name in ReceiveUnitPanel (see
  // handleItemNoBlur).
  const [catalog] = useLocalStorage(SM_CATALOG_STORAGE_KEY, SM_CATALOG_SEED);
  const [operator, setOperator] = useState("");

  useEffect(() => {
    getCipSession().then((session) => setOperator(session?.username ?? ""));
  }, []);

  // Called from every mutation entry point (handleCreate/handleIssue/
  // handleIssueUnits/handleBulkIssue) right after the matching setItems
  // call - one log entry per physical unit/aggregate actually moved, newest
  // first, capped the same way CipMaterialsHistoryTable's own CIP-backed
  // history is.
  function logOperation(entries) {
    const time = new Date().toISOString();
    setOperationHistory((prev) =>
      [...entries.map((entry) => ({ id: makeSmHistoryId(), operator, time, ...entry })), ...prev].slice(0, SM_HISTORY_LIMIT)
    );
  }

  // Plain drag-to-resize, seeded with the header's measured on-screen width
  // so the column starts from where it visually is instead of jumping to a
  // default the instant you grab the handle. No TanStack model here, so
  // width is tracked by column id and applied only to the <TableHead> -
  // the column's cells follow its resolved width automatically.
  //
  // The very first resize also seeds *every other* column's current width,
  // not just the one being dragged, and that's what flips the table over
  // to table-layout:fixed (see className on <Table> below). Plain
  // table-layout:auto always widens a column to fit its longest
  // unbreakable word/number no matter what width is requested on the
  // header - that's the "can't narrow past long text" bug this works
  // around; fixed layout makes the header's explicit width authoritative,
  // so the cell actually has to wrap instead. Seeding every column with
  // its own current size first means that switch is a visual no-op - only
  // the dragged column moves. (Rows stay unvirtualized/all-mounted - see
  // bodyRows/MemoBodyRow below - so table-fixed only needs to kick in once
  // the user actually resizes something, not from the very first render.)
  function startResize(event, columnId) {
    event.preventDefault();
    event.stopPropagation();
    const pointerEvent = event.touches?.[0] ?? event;
    const startX = pointerEvent.clientX;
    const thElement = event.currentTarget.closest("th");

    if (Object.keys(columnSizing).length === 0) {
      const row = thElement?.closest("tr");
      const seeded = {};
      row?.querySelectorAll("[data-column-id]").forEach((th) => {
        seeded[th.dataset.columnId] = th.getBoundingClientRect().width;
      });
      if (Object.keys(seeded).length > 0) flushSync(() => setColumnSizing(seeded));
    } else if (columnSizing[columnId] === undefined) {
      const measured = thElement?.getBoundingClientRect().width;
      if (measured) flushSync(() => setColumnSizing((prev) => ({ ...prev, [columnId]: measured })));
    }
    const startWidth = columnSizing[columnId] ?? thElement?.getBoundingClientRect().width ?? 150;

    function onMove(moveEvent) {
      const moveClientX = moveEvent.touches?.[0]?.clientX ?? moveEvent.clientX;
      const next = Math.max(60, startWidth + (moveClientX - startX));
      setColumnSizing((prev) => ({ ...prev, [columnId]: next }));
    }
    function onEnd() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
  }

  function resetColumnSize(columnId) {
    setColumnSizing((prev) => {
      const { [columnId]: _removed, ...rest } = prev;
      return rest;
    });
  }

  function ResizeHandle({ columnId }) {
    return (
      <div
        onMouseDown={(event) => startResize(event, columnId)}
        onTouchStart={(event) => startResize(event, columnId)}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={() => resetColumnSize(columnId)}
        title={tActions("resetColumnWidth")}
        className="absolute right-0 top-0 z-10 h-full w-2 cursor-col-resize touch-none select-none hover:bg-gray-300/60 dark:hover:bg-neutral-600/50"
      />
    );
  }

  function headStyle(columnId) {
    const width = columnSizing[columnId];
    return width ? { width, minWidth: width, maxWidth: width } : undefined;
  }

  function toggleItem(itemNo) {
    setExpandedItems((prev) => ({ ...prev, [itemNo]: !prev[itemNo] }));
  }

  function setRowSelected(id, checked) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // Selects/deselects every unit under an item at once - the item row's own
  // checkbox stands in for "all of these", not a leaf id of its own.
  function setItemSelected(item, checked) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      item.units.forEach((u) => (checked ? next.add(u.id) : next.delete(u.id)));
      return next;
    });
  }

  const itemNameOptions = useMemo(
    () => [...new Set(items.map((it) => it.itemName))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [items]
  );

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const noteQuery = columnFilters.note.trim().toLowerCase();
    const min = parseFloat(columnFilters.quantityMin);
    const max = parseFloat(columnFilters.quantityMax);

    return items.filter((it) => {
      if (q) {
        const matchesSearch =
          it.itemNo.toLowerCase().includes(q) ||
          it.itemName.toLowerCase().includes(q) ||
          (it.units ?? []).some((u) => u.unitId.toLowerCase().includes(q));
        if (!matchesSearch) return false;
      }
      if (nameFilter && !nameFilter.includes(it.itemName)) return false;
      if (noteQuery && !(it.note ?? "").toLowerCase().includes(noteQuery)) return false;
      const qty = itemQuantityValue(it);
      if (!Number.isNaN(min) && qty < min) return false;
      if (!Number.isNaN(max) && qty > max) return false;
      return true;
    });
  }, [items, search, columnFilters, nameFilter]);

  const hasColumnFilter = (key) => columnFilters[key].trim() !== "";
  const hasQuantityFilter = columnFilters.quantityMin.trim() !== "" || columnFilters.quantityMax.trim() !== "";

  function setColumnFilter(key, value) {
    setColumnFilters((prev) => ({ ...prev, [key]: value }));
  }

  function clearColumnFilter(...keys) {
    setColumnFilters((prev) => {
      const next = { ...prev };
      keys.forEach((key) => (next[key] = ""));
      return next;
    });
  }

  const nameFilterSelected = nameFilter ?? itemNameOptions;
  const visibleNameOptions = nameFilterSearch.trim()
    ? itemNameOptions.filter((name) => name.toLowerCase().includes(nameFilterSearch.trim().toLowerCase()))
    : itemNameOptions;

  function toggleNameFilterValue(value) {
    setNameFilter((prev) => {
      const current = prev ?? itemNameOptions;
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return next.length === itemNameOptions.length ? undefined : next;
    });
  }

  const leafIds = useMemo(
    () => filteredItems.flatMap((it) => (it.trackedIndividually ? it.units.map((u) => u.id) : [it.itemNo])),
    [filteredItems]
  );
  const allSelected = leafIds.length > 0 && leafIds.every((id) => selectedIds.has(id));
  const someSelected = leafIds.some((id) => selectedIds.has(id));

  function toggleSelectAll(checked) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      leafIds.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  // Flattens filteredItems into one entry per actual <TableRow> that would
  // render - an aggregate item is one row, a flat-view item is one row per
  // unit, a single-unit item collapses to one row, and a multi-unit group
  // is its own parent row plus one row per unit when expanded. Rendered
  // below via the memoized BodyRow component (see its comment) rather
  // than windowed/virtualized - see AGENTS.md's note on large tables
  // needing row-level optimization past a couple hundred rows, which this
  // list has grown well past since the CIP import.
  const bodyRows = useMemo(() => {
    const list = [];
    filteredItems.forEach((item) => {
      if (!item.trackedIndividually) {
        list.push({ kind: "aggregate", key: item.itemNo, item });
        return;
      }
      const pending = hasPendingQuantity(item);
      if (viewMode === "flat") {
        if (pending) list.push({ kind: "pendingRow", key: `${item.itemNo}-pending`, item });
        item.units.forEach((u) => list.push({ kind: "flatUnit", key: u.id, item, unit: u }));
        return;
      }
      // A pending remainder always makes the item expandable (even with
      // 0 or 1 real units so far) so there's somewhere for its "Przypisz
      // numery szpul" row to live - see AssignSpoolNumbersPanel.
      if (item.units.length === 1 && !pending) {
        list.push({ kind: "singleUnit", key: item.itemNo, item, unit: item.units[0] });
        return;
      }
      list.push({ kind: "groupParent", key: item.itemNo, item });
      if (expandedItems[item.itemNo]) {
        if (pending) list.push({ kind: "pendingChild", key: `${item.itemNo}-pending`, item });
        item.units.forEach((u) => list.push({ kind: "groupChild", key: u.id, item, unit: u }));
      }
    });
    return list;
  }, [filteredItems, viewMode, expandedItems]);

  // The bulk-issue dialog's row list - resolved from every selected id
  // against the live (unfiltered) items, so a selection made before
  // narrowing the search/filters still shows up correctly.
  const selectedRows = useMemo(() => {
    const rows = [];
    items.forEach((item) => {
      if (!item.trackedIndividually) {
        if (selectedIds.has(item.itemNo)) {
          rows.push({ kind: "aggregate", id: item.itemNo, itemNo: item.itemNo, itemName: item.itemName, quantity: item.totalQuantity });
        }
        return;
      }
      item.units.forEach((u) => {
        if (selectedIds.has(u.id)) {
          rows.push({ kind: "unit", id: u.id, itemNo: item.itemNo, itemName: item.itemName, unitId: u.unitId, unitType: u.unitType, productBatch: u.productBatch, quantity: u.quantity });
        }
      });
    });
    return rows;
  }, [items, selectedIds]);

  // Pure reducer step shared by both handleCreate (one unit) and
  // handleCreateBulk (the bulk-receipt grid's many rows folded over the
  // same running items array) - same shape as issueRow below.
  function receiveUnit(itemsArr, unit) {
    const idx = itemsArr.findIndex((it) => it.itemNo === unit.itemNo);
    const newUnit = { id: unit.id, unitType: unit.unitType, unitId: unit.unitId, productBatch: unit.productBatch ?? "", quantity: unit.quantity, note: "-", cipStatus: "match" };
    if (idx === -1) {
      return [
        { itemNo: unit.itemNo, itemName: unit.itemName, locationCode: unit.locationCode, note: "-", trackedIndividually: true, units: [newUnit] },
        ...itemsArr,
      ];
    }
    const next = [...itemsArr];
    next[idx] = { ...next[idx], units: [newUnit, ...next[idx].units] };
    return next;
  }

  function historyEntryForReceipt(unit) {
    return { operation: "receipt", itemNo: unit.itemNo, itemName: unit.itemName, unitId: unit.unitId, quantity: unit.quantity, location: unit.locationCode };
  }

  function handleCreate(unit) {
    setItems((prev) => receiveUnit(prev, unit));
    setExpandedItems((prev) => ({ ...prev, [unit.itemNo]: true }));
    logOperation([historyEntryForReceipt(unit)]);
    pushToast(t("toast.received", { itemName: unit.itemName, quantity: unit.quantity }));
  }

  // "Przyjęcie zamówienia" (order receipt) - the real order list this
  // mirrors (see AGENTS.md) never carries spool numbers, only item +
  // summed quantity, so this doesn't create a numbered unit like
  // handleCreate/receiveUnit above. It adds to (or creates) the item's
  // pendingQuantity instead - real stock, already on hand, waiting for
  // spool numbers once the physical units are labeled (see
  // handleAssignUnits/AssignSpoolNumbersPanel). An item that doesn't
  // exist yet is created as trackedIndividually with an empty units
  // array, since order-received items are always meant to end up
  // per-spool tracked.
  function receivePendingQuantity(itemsArr, entry) {
    const idx = itemsArr.findIndex((it) => it.itemNo === entry.itemNo);
    if (idx === -1) {
      return [
        { itemNo: entry.itemNo, itemName: entry.itemName, locationCode: entry.locationCode, note: "-", trackedIndividually: true, units: [], pendingQuantity: entry.quantity },
        ...itemsArr,
      ];
    }
    const next = [...itemsArr];
    const existing = next[idx];
    const total = (parseFloat(existing.pendingQuantity) || 0) + (parseFloat(entry.quantity) || 0);
    next[idx] = { ...existing, pendingQuantity: total % 1 === 0 ? String(total) : total.toFixed(3) };
    return next;
  }

  function handleReceiveOrder(entries) {
    setItems((prev) => entries.reduce((acc, entry) => receivePendingQuantity(acc, entry), prev));
    setExpandedItems((prev) => {
      const next = { ...prev };
      entries.forEach((entry) => {
        next[entry.itemNo] = true;
      });
      return next;
    });
    logOperation(
      entries.map((entry) => ({ operation: "receipt", itemNo: entry.itemNo, itemName: entry.itemName, unitId: "", quantity: entry.quantity, location: entry.locationCode }))
    );
    pushToast(t("toast.receivedBulk", { count: entries.length }));
  }

  // Second half of the order workflow: converts part (or all) of an
  // item's pendingQuantity into real numbered units once the physical
  // spools are labeled. Does NOT add new stock - that quantity was
  // already counted by handleReceiveOrder - so it's logged as its own
  // "labeling" operation kind, not another "receipt" (see
  // AssignSpoolNumbersPanel and lib/smOperationHistory.js).
  function handleAssignUnits(item, draftRows) {
    const newUnits = draftRows.map((row) => ({
      id: `u-${Date.now()}-${row.id}`,
      unitType: "spool",
      unitId: row.unitId,
      productBatch: "",
      quantity: row.quantity,
      note: "-",
      cipStatus: "match",
    }));
    const assignedTotal = draftRows.reduce((sum, row) => sum + (parseFloat(row.quantity) || 0), 0);
    setItems((prev) =>
      prev.map((it) => {
        if (it.itemNo !== item.itemNo) return it;
        const remaining = (parseFloat(it.pendingQuantity) || 0) - assignedTotal;
        return {
          ...it,
          units: [...it.units, ...newUnits],
          pendingQuantity: remaining > 0 ? (remaining % 1 === 0 ? String(remaining) : remaining.toFixed(3)) : undefined,
        };
      })
    );
    setExpandedItems((prev) => ({ ...prev, [item.itemNo]: true }));
    logOperation(
      newUnits.map((u) => ({ operation: "labeling", itemNo: item.itemNo, itemName: item.itemName, unitId: u.unitId, quantity: u.quantity, location: item.locationCode }))
    );
    pushToast(t("toast.unitsAssigned", { count: newUnits.length, itemName: item.itemName }));
  }

  function handleSave(row, patch) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.itemNo !== row.itemNo) return it;
        if (row.kind === "aggregate") {
          return { ...it, itemName: patch.itemName, totalQuantity: patch.quantity, note: patch.note };
        }
        if (row.kind === "item") {
          return { ...it, itemName: patch.itemName, note: patch.note };
        }
        if (row.kind === "pending") {
          return { ...it, itemName: patch.itemName, pendingQuantity: patch.quantity, note: patch.note };
        }
        return {
          ...it,
          itemName: patch.itemName ?? it.itemName,
          units: it.units.map((u) => (u.id === row.id ? { ...u, unitId: patch.unitId, quantity: patch.quantity, note: patch.note } : u)),
        };
      })
    );
  }

  // Pure reducer step shared by every issue path (single row, group
  // checklist, cross-item bulk): issuing less than what's available shrinks
  // the remaining amount; issuing everything clamps it to 0 rather than
  // removing the item - a material stays on the list (at 0) instead of
  // vanishing the moment its last unit/quantity is issued away, so it's
  // never mistaken for "never existed" rather than "fully issued".
  function issueRow(itemsArr, row, quantity) {
    if (row.kind === "aggregate") {
      return itemsArr.map((it) => {
        if (it.itemNo !== row.itemNo) return it;
        const available = parseFloat(it.totalQuantity);
        const issued = quantity !== undefined ? parseFloat(quantity) : available;
        const remaining = Math.max(available - issued, 0);
        const formatted = remaining % 1 === 0 ? String(remaining) : remaining.toFixed(3);
        return { ...it, totalQuantity: formatted };
      });
    }
    // A "Brak" row - stock already on hand but not yet split into numbered
    // spools (see receivePendingQuantity) - can be issued directly, same as
    // an aggregate's total. Issuing everything clears pendingQuantity (the
    // "Brak" row itself disappears, since there's nothing left unassigned)
    // but - like every other branch here - never removes the item.
    if (row.kind === "pending") {
      return itemsArr.map((it) => {
        if (it.itemNo !== row.itemNo) return it;
        const available = parseFloat(it.pendingQuantity) || 0;
        const issued = quantity !== undefined ? parseFloat(quantity) : available;
        const remaining = Math.max(available - issued, 0);
        if (remaining <= 0) {
          const { pendingQuantity, ...rest } = it;
          return rest;
        }
        const formatted = remaining % 1 === 0 ? String(remaining) : remaining.toFixed(3);
        return { ...it, pendingQuantity: formatted };
      });
    }
    return itemsArr.map((it) => {
      if (it.itemNo !== row.itemNo) return it;
      return {
        ...it,
        units: it.units.flatMap((u) => {
          if (u.id !== row.id) return [u];
          const available = parseFloat(u.quantity);
          const issued = quantity !== undefined ? parseFloat(quantity) : available;
          if (issued >= available) return [];
          const remaining = available - issued;
          const formatted = remaining % 1 === 0 ? String(remaining) : remaining.toFixed(3);
          return [{ ...u, quantity: formatted }];
        }),
      };
    });
  }

  function handleIssue(row, quantity) {
    const item = items.find((it) => it.itemNo === row.itemNo);
    setItems((prev) => issueRow(prev, row, quantity));
    logOperation([{ operation: "issue", itemNo: row.itemNo, itemName: row.itemName, unitId: row.unitId, quantity: quantity ?? row.quantity, location: item?.locationCode }]);
    pushToast(t("toast.issued", { itemName: row.itemName, quantity: quantity ?? row.quantity }));
  }

  // Manual cleanup for a material that's sitting at 0 (see issueRow's
  // "never remove the item" policy) - not an inventory transaction, so
  // this doesn't go through logOperation like the other handlers here.
  // Called from EditUnitPanel's own Delete button; returns whether it
  // actually went through, so the panel only closes on a real deletion
  // and stays open if the confirm prompt was cancelled.
  function handleDeleteItem(item) {
    if (!window.confirm(t("actions.confirmDeleteZero", { itemName: item.itemName }))) return false;
    setItems((prev) => prev.filter((it) => it.itemNo !== item.itemNo));
    pushToast(t("toast.deleted", { itemName: item.itemName }));
    return true;
  }

  // Same as handleIssue, batched - the group row's own "Wydaj" picks any
  // number of its units to issue at once instead of one at a time, each
  // with its own (editable, prefilled-to-full) quantity - reduced through
  // the same issueRow used everywhere else so a smaller amount shrinks the
  // unit instead of always removing it outright.
  function handleIssueUnits(item, entries) {
    setItems((prev) => entries.reduce((acc, { id, quantity }) => issueRow(acc, { kind: "unit", itemNo: item.itemNo, id }, quantity), prev));
    logOperation(
      entries.map(({ id, quantity }) => {
        const u = item.units.find((unit) => unit.id === id);
        return { operation: "issue", itemNo: item.itemNo, itemName: item.itemName, unitId: u.unitId, quantity: quantity ?? u.quantity, location: item.locationCode };
      })
    );
    pushToast(t("toast.issuedUnits", { count: entries.length, itemName: item.itemName }));
  }

  // Cross-item bulk issue - each selected leaf row (unit or whole
  // aggregate item), issued in sequence over the same running items array.
  function handleBulkIssue(entries) {
    setItems((prev) => entries.reduce((acc, { row, quantity }) => issueRow(acc, row, quantity), prev));
    logOperation(
      entries.map(({ row, quantity }) => {
        const item = items.find((it) => it.itemNo === row.itemNo);
        return { operation: "issue", itemNo: row.itemNo, itemName: row.itemName, unitId: row.unitId, quantity: quantity ?? row.quantity, location: item?.locationCode };
      })
    );
    setSelectedIds(new Set());
    pushToast(t("toast.issuedBulk", { count: entries.length }));
  }

  async function handleExport() {
    setExporting(true);
    try {
      const headers = [t("columns.itemNo"), t("columns.itemName"), t("columns.unitId"), t("columns.quantity"), t("columns.location"), t("columns.note")];
      const rows = filteredItems.flatMap((it) => {
        if (!it.trackedIndividually) return [[it.itemNo, it.itemName, "-", it.totalQuantity, it.locationCode, it.note]];
        const unitRows = it.units.map((u) => [it.itemNo, it.itemName, u.unitId, u.quantity, it.locationCode, it.note]);
        const pendingRow = hasPendingQuantity(it) ? [[it.itemNo, it.itemName, t("pending.unitLabel"), it.pendingQuantity, it.locationCode, it.note]] : [];
        return [...unitRows, ...pendingRow];
      });
      const stamp = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
      await downloadStockXlsx({ fileName: `materialy_sm_${stamp}.xlsx`, sheets: [{ sheetName: "Materiały SM", headers, rows }] });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-navy-950 dark:text-white">{t("title")}</h1>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-neutral-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("columns.itemNo") + " / " + t("columns.itemName") + " / " + t("columns.unitId")}
            className="h-9 w-full rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-100 dark:bg-neutral-800 pl-9 pr-3 text-sm text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400"
          />
        </div>
        <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-100 dark:bg-neutral-800 p-1">
          <button
            type="button"
            onClick={() => setViewMode("grouped")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === "grouped"
                ? "bg-white text-navy-950 shadow-sm dark:bg-neutral-900 dark:text-white"
                : "text-gray-500 hover:text-gray-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            }`}
          >
            <Layers className="h-4 w-4" />
            {t("viewMode.grouped")}
          </button>
          <button
            type="button"
            onClick={() => setViewMode("flat")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              viewMode === "flat"
                ? "bg-white text-navy-950 shadow-sm dark:bg-neutral-900 dark:text-white"
                : "text-gray-500 hover:text-gray-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            }`}
          >
            <List className="h-4 w-4" />
            {t("viewMode.flat")}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={selectedIds.size === 0}
            onClick={() => setBulkIssueOpen(true)}
          >
            <PackageMinus className="h-4 w-4" />
            {t("bulkIssuePanel.trigger", { count: selectedIds.size })}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport} disabled={exporting}>
            <Download className="h-4 w-4" />
            {exporting ? tActions("exporting") : tActions("exportExcel")}
          </Button>
          <Button size="sm" className="gap-1.5 px-3.5 font-semibold" onClick={() => setReceiveOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("addReceipt")}
          </Button>
        </div>
      </div>

      <div className="mt-4 -mx-8">
        <Table
          containerClassName="min-h-[500px] max-h-[60vh] overflow-y-auto"
          className={Object.keys(columnSizing).length > 0 ? "table-fixed" : undefined}
        >
          <TableHeader>
            <TableRow className="border-b border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800">
              {viewMode === "grouped" && (
                <TableHead data-column-id="chevron" className="sticky top-0 z-30 w-8 bg-gray-50 pl-8 dark:bg-neutral-800" />
              )}
              <TableHead
                data-column-id="select"
                className={`sticky top-0 z-30 w-10 bg-gray-50 dark:bg-neutral-800 ${viewMode === "grouped" ? "" : "pl-8"}`}
              >
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected && !allSelected}
                  onCheckedChange={(value) => toggleSelectAll(Boolean(value))}
                />
              </TableHead>
              <TableHead
                data-column-id="itemNo"
                style={headStyle("itemNo")}
                className="sticky top-0 z-30 bg-gray-50 text-[11px] font-medium tracking-wide text-gray-400 dark:bg-neutral-800 dark:text-neutral-500"
              >
                {t("columns.itemNo")}
                <ResizeHandle columnId="itemNo" />
              </TableHead>
              <TableHead
                data-column-id="itemName"
                style={headStyle("itemName")}
                className="sticky top-0 z-30 bg-gray-50 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:bg-neutral-800 dark:text-neutral-500"
              >
                <Popover onOpenChange={(open) => open && setNameFilterSearch("")}>
                  <PopoverTrigger
                    render={
                      <button type="button" className="flex items-center gap-1">
                        <span>{t("columns.itemName")}</span>
                        <Filter
                          className={`h-3 w-3 shrink-0 ${
                            nameFilter ? "text-navy-600 dark:text-navy-300" : "text-gray-400 dark:text-neutral-500"
                          }`}
                        />
                      </button>
                    }
                  />
                  <PopoverContent align="start" className="w-72">
                    <input
                      type="text"
                      autoFocus
                      value={nameFilterSearch}
                      onChange={(e) => setNameFilterSearch(e.target.value)}
                      placeholder={t("tableFilters.searchOptions")}
                      className={FIELD_CLS}
                    />
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setNameFilter(undefined)}
                        className="font-medium text-navy-700 hover:underline dark:text-navy-300"
                      >
                        {t("tableFilters.selectAll")}
                      </button>
                      <span className="text-gray-300 dark:text-neutral-600">·</span>
                      <button
                        type="button"
                        onClick={() => setNameFilter([])}
                        className="font-medium text-navy-700 hover:underline dark:text-navy-300"
                      >
                        {t("tableFilters.selectNone")}
                      </button>
                    </div>
                    <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                      {visibleNameOptions.map((value) => (
                        <label
                          key={value}
                          className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 text-sm text-gray-700 hover:bg-gray-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
                        >
                          <Checkbox checked={nameFilterSelected.includes(value)} onCheckedChange={() => toggleNameFilterValue(value)} className="mt-0.5" />
                          <span className="break-words">{value}</span>
                        </label>
                      ))}
                      {visibleNameOptions.length === 0 && (
                        <p className="px-1 py-1 text-sm text-gray-400 dark:text-neutral-500">{t("tableFilters.noOptions")}</p>
                      )}
                    </div>
                    {nameFilter && (
                      <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setNameFilter(undefined)}>
                        {t("tableFilters.clear")}
                      </Button>
                    )}
                  </PopoverContent>
                </Popover>
                <ResizeHandle columnId="itemName" />
              </TableHead>
              {viewMode === "flat" && (
                <TableHead
                  data-column-id="materialNumber"
                  style={headStyle("materialNumber")}
                  className="sticky top-0 z-30 bg-gray-50 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:bg-neutral-800 dark:text-neutral-500"
                >
                  {t("columns.materialNumber")}
                  <ResizeHandle columnId="materialNumber" />
                </TableHead>
              )}
              <TableHead
                data-column-id="quantity"
                style={headStyle("quantity")}
                className="sticky top-0 z-30 bg-gray-50 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:bg-neutral-800 dark:text-neutral-500"
              >
                <Popover>
                  <PopoverTrigger
                    render={
                      <button type="button" className="flex items-center gap-1">
                        <span>{t("columns.quantity")}</span>
                        <Filter
                          className={`h-3 w-3 shrink-0 ${
                            hasQuantityFilter ? "text-navy-600 dark:text-navy-300" : "text-gray-400 dark:text-neutral-500"
                          }`}
                        />
                      </button>
                    }
                  />
                  <PopoverContent align="start" className="w-56">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        autoFocus
                        value={columnFilters.quantityMin}
                        onChange={(e) => setColumnFilter("quantityMin", sanitizeQuantityInput(e.target.value))}
                        placeholder={t("tableFilters.quantityMin")}
                        className={FIELD_CLS}
                      />
                      <span className="text-gray-400 dark:text-neutral-500">–</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={columnFilters.quantityMax}
                        onChange={(e) => setColumnFilter("quantityMax", sanitizeQuantityInput(e.target.value))}
                        placeholder={t("tableFilters.quantityMax")}
                        className={FIELD_CLS}
                      />
                    </div>
                    {hasQuantityFilter && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                        onClick={() => clearColumnFilter("quantityMin", "quantityMax")}
                      >
                        {t("tableFilters.clear")}
                      </Button>
                    )}
                  </PopoverContent>
                </Popover>
                <ResizeHandle columnId="quantity" />
              </TableHead>
              <TableHead
                data-column-id="location"
                style={headStyle("location")}
                className="sticky top-0 z-30 bg-gray-50 text-[11px] font-medium tracking-wide text-gray-400 dark:bg-neutral-800 dark:text-neutral-500"
              >
                {t("columns.location")}
                <ResizeHandle columnId="location" />
              </TableHead>
              <TableHead
                data-column-id="note"
                style={headStyle("note")}
                className="sticky top-0 z-30 bg-gray-50 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:bg-neutral-800 dark:text-neutral-500"
              >
                <Popover>
                  <PopoverTrigger
                    render={
                      <button type="button" className="flex items-center gap-1">
                        <span>{t("columns.note")}</span>
                        <Filter
                          className={`h-3 w-3 shrink-0 ${
                            hasColumnFilter("note") ? "text-navy-600 dark:text-navy-300" : "text-gray-400 dark:text-neutral-500"
                          }`}
                        />
                      </button>
                    }
                  />
                  <PopoverContent align="start" className="w-56">
                    <input
                      type="text"
                      autoFocus
                      value={columnFilters.note}
                      onChange={(e) => setColumnFilter("note", e.target.value)}
                      placeholder={t("tableFilters.notePlaceholder")}
                      className={FIELD_CLS}
                    />
                    {hasColumnFilter("note") && (
                      <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => clearColumnFilter("note")}>
                        {t("tableFilters.clear")}
                      </Button>
                    )}
                  </PopoverContent>
                </Popover>
                <ResizeHandle columnId="note" />
              </TableHead>
              <TableHead
                data-column-id="actions"
                className="sticky right-0 top-0 z-40 w-20 border-l border-gray-200 bg-gray-50 pr-4 dark:border-neutral-700 dark:bg-neutral-800"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {bodyRows.map((row) => {
              const isGroupParent = row.kind === "groupParent";
              const hasNoSelection = isGroupParent || row.kind === "pendingChild" || row.kind === "pendingRow";
              const selectionId = hasNoSelection ? null : row.kind === "aggregate" ? row.item.itemNo : row.unit.id;
              return (
                <BodyRow
                  key={row.key}
                  row={row}
                  isSelected={selectionId !== null && selectedIds.has(selectionId)}
                  isGroupOpen={isGroupParent ? Boolean(expandedItems[row.item.itemNo]) : false}
                  itemAllSelected={isGroupParent ? row.item.units.length > 0 && row.item.units.every((u) => selectedIds.has(u.id)) : false}
                  itemSomeSelected={isGroupParent ? row.item.units.some((u) => selectedIds.has(u.id)) : false}
                  viewMode={viewMode}
                  columnSizing={columnSizing}
                  t={t}
                  onToggleSelect={setRowSelected}
                  onToggleItemSelect={setItemSelected}
                  onToggleItem={toggleItem}
                  onEdit={setEditingRow}
                  onIssue={setIssuingRow}
                  onIssueGroup={setIssuingGroup}
                  onAssignUnits={setAssigningItem}
                />
              );
            })}
          </TableBody>
        </Table>
      </div>

      {selectedIds.size > 0 && (
        <p className="mt-2 pl-1 text-xs text-gray-500 dark:text-neutral-400">
          {tStock("selectedCount", { count: selectedIds.size, total: leafIds.length })}
        </p>
      )}

      <ReceiveUnitPanel
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        onCreate={handleCreate}
        onReceiveOrder={handleReceiveOrder}
        items={items}
        catalog={catalog}
        t={t}
      />
      <EditUnitPanel
        row={editingRow}
        open={Boolean(editingRow)}
        onOpenChange={(open) => !open && setEditingRow(null)}
        onSave={handleSave}
        onDelete={handleDeleteItem}
        t={t}
      />
      <IssueUnitPanel row={issuingRow} open={Boolean(issuingRow)} onOpenChange={(open) => !open && setIssuingRow(null)} onIssue={handleIssue} t={t} />
      <IssueGroupPanel
        item={issuingGroup}
        open={Boolean(issuingGroup)}
        onOpenChange={(open) => !open && setIssuingGroup(null)}
        onIssue={handleIssueUnits}
        t={t}
      />
      <AssignSpoolNumbersPanel
        item={assigningItem}
        open={Boolean(assigningItem)}
        onOpenChange={(open) => !open && setAssigningItem(null)}
        onAssign={handleAssignUnits}
        t={t}
      />
      <BulkIssuePanel
        rows={selectedRows}
        open={bulkIssueOpen}
        onOpenChange={setBulkIssueOpen}
        onIssue={handleBulkIssue}
        t={t}
      />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
