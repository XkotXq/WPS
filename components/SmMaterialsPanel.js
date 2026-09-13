"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useLocalStorage } from "usehooks-ts";
import { Plus, Pencil, PackageMinus, Search, Download, Upload, ChevronDown, ChevronRight, Layers, List, Filter, Package, Boxes } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToastStack, useToastStack } from "@/components/ui/toast";
import BulkReceiveGrid from "@/components/BulkReceiveGrid";
import { downloadStockXlsx } from "@/lib/xlsxExport";
import { SM_INITIAL_ITEMS } from "@/lib/smMaterialsSeed";
import { getCipSession } from "@/lib/cipSession";
import { SM_HISTORY_LIMIT, SM_HISTORY_SEED, SM_HISTORY_STORAGE_KEY, makeSmHistoryId } from "@/lib/smOperationHistory";

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
  return parseFloat(item.trackedIndividually ? sumQuantity(item.units) : item.totalQuantity);
}

// Keeps only digits and a single decimal separator, normalizing "," to "."
// - used on every quantity input so the field can only ever hold a number.
function sanitizeQuantityInput(value) {
  const cleaned = value.replace(",", ".").replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
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

// Module-level counter (not per-render state) so ids stay unique across
// the whole session, including rows added by both "+ Dodaj wiersz" and a
// bulk file import - mirrors makeSmHistoryId's same reasoning.
let bulkRowSeq = 0;
function newBulkReceiveRow() {
  bulkRowSeq += 1;
  return { id: `bulk-${bulkRowSeq}`, itemNo: "", itemName: "", quantity: "", location: "", unitId: "" };
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
function ReceiveUnitPanel({ open, onOpenChange, onCreate, onCreateBulk, items, t }) {
  const [itemNo, setItemNo] = useState("");
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [location, setLocation] = useState("");
  const [unitId, setUnitId] = useState("");
  const [importError, setImportError] = useState("");
  const [receiveMode, setReceiveMode] = useState("single");
  const [bulkRows, setBulkRows] = useState(() => [newBulkReceiveRow(), newBulkReceiveRow(), newBulkReceiveRow()]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setItemNo("");
    setItemName("");
    setQuantity("");
    setLocation("");
    setUnitId("");
    setImportError("");
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
  // than blocking the whole save.
  const validBulkUnits = bulkRows
    .filter((row) => row.itemNo.trim() && row.itemName.trim() && row.quantity.trim() && row.unitId.trim())
    .map((row) => ({
      id: `u-${Date.now()}-${row.id}`,
      unitType: "spool",
      itemNo: row.itemNo.trim(),
      itemName: row.itemName.trim(),
      unitId: row.unitId.trim(),
      quantity: row.quantity.trim(),
      locationCode: row.location.trim() || "MT",
    }));

  function handleBulkSubmit() {
    if (validBulkUnits.length === 0) return;
    onCreateBulk(validBulkUnits);
    onOpenChange(false);
  }

  // Auto-fills the name once the user leaves the item-number field, looked
  // up against the materials already known to this page - there's no real
  // backend endpoint for this yet (see AGENTS.md), so this stands in for
  // one until it exists; swapping in a real fetch later only touches this
  // function.
  function handleItemNoBlur() {
    const trimmed = itemNo.trim();
    if (!trimmed) return;
    const match = items.find((it) => it.itemNo.toLowerCase() === trimmed.toLowerCase());
    if (match) setItemName(match.itemName);
  }

  // Reads the file and fills the form from it, matching by header label
  // against the same t("columns.xxx") strings handleExport (below) writes
  // as its own headers - a file exported from this page's own "Eksportuj"
  // round-trips straight back in. xlsx-js-style is already a dependency
  // (lib/xlsxExport.js uses it to write) and reads just as well, so this
  // needs nothing new installed. Single mode only ever reads the first
  // data row (one receipt); bulk mode reads every data row straight into
  // the grid, replacing whatever rows were there.
  async function handleImportFile(file) {
    if (!file) return;
    setImportError("");
    try {
      const XLSX = (await import("xlsx-js-style")).default;
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      const [headerRow, ...dataRows] = rows;
      if (!headerRow || dataRows.length === 0) throw new Error("empty");

      const header = headerRow.map((cell) => String(cell).trim().toLowerCase());
      function cellFor(row, label, fallbackIndex) {
        const index = header.indexOf(label.trim().toLowerCase());
        const value = row[index === -1 ? fallbackIndex : index];
        return value === undefined || value === null ? "" : String(value).trim();
      }

      if (receiveMode === "bulk") {
        const nonEmptyRows = dataRows.filter((row) => row.some((cell) => String(cell).trim() !== ""));
        if (nonEmptyRows.length === 0) throw new Error("empty");
        setBulkRows(
          nonEmptyRows.map((row) => ({
            ...newBulkReceiveRow(),
            itemNo: cellFor(row, t("columns.itemNo"), 0),
            itemName: cellFor(row, t("columns.itemName"), 1),
            unitId: cellFor(row, t("columns.unitId"), 2),
            quantity: sanitizeQuantityInput(cellFor(row, t("columns.quantity"), 3)),
            location: cellFor(row, t("columns.location"), 4),
          }))
        );
      } else {
        const dataRow = dataRows[0];
        setItemNo(cellFor(dataRow, t("columns.itemNo"), 0));
        setItemName(cellFor(dataRow, t("columns.itemName"), 1));
        setUnitId(cellFor(dataRow, t("columns.unitId"), 2));
        setQuantity(sanitizeQuantityInput(cellFor(dataRow, t("columns.quantity"), 3)));
        setLocation(cellFor(dataRow, t("columns.location"), 4));
      }
    } catch {
      setImportError(t("receivePanel.importError"));
    }
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
      <DialogContent className={receiveMode === "bulk" ? "max-w-2xl" : undefined}>
        <DialogHeader>
          <DialogTitle>{t("receivePanel.title")}</DialogTitle>
        </DialogHeader>

        <input
          type="file"
          ref={fileInputRef}
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            handleImportFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

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
        {importError && <p className="text-xs text-red-600 dark:text-red-400">{importError}</p>}

        <DialogFooter className="justify-between">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4" />
            {t("receivePanel.import")}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t("receivePanel.cancel")}
            </Button>
            <Button
              type={receiveMode === "single" ? "submit" : "button"}
              form={receiveMode === "single" ? "receive-unit-form" : undefined}
              size="sm"
              disabled={receiveMode === "bulk" && validBulkUnits.length === 0}
              onClick={receiveMode === "bulk" ? handleBulkSubmit : undefined}
            >
              {t("receivePanel.save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUnitPanel({ row, open, onOpenChange, onSave, t }) {
  const [itemName, setItemName] = useState("");
  const [unitId, setUnitId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const hasUnitId = row?.kind === "unit";
  const hasQuantity = row?.kind === "unit" || row?.kind === "aggregate";

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("editPanel.title")}</SheetTitle>
        </SheetHeader>

        <form id="edit-unit-form" onSubmit={handleSubmit} className="flex flex-1 flex-col gap-3 overflow-y-auto">
          <UnitInfo row={row} t={t} />

          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>{t("columns.itemName")}</span>
            <input className={FIELD_CLS} value={itemName} onChange={(e) => setItemName(e.target.value)} />
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

        <SheetFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("editPanel.cancel")}
          </Button>
          <Button type="submit" form="edit-unit-form" size="sm">
            {t("editPanel.save")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// Materials tracked as one combined quantity (no individual units - e.g.
// thread sold by weight) can be issued partially: a quantity input caps at
// what's left, and the item keeps its remaining amount instead of getting
// removed outright. A single physical unit (a spool, a bigbag) has no such
// partial concept here - issuing one always removes that whole unit.
function IssueUnitPanel({ row, open, onOpenChange, onIssue, t }) {
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState("");
  const isAggregate = row?.kind === "aggregate";

  useEffect(() => {
    if (!row) return;
    setQuantity("");
    setError("");
  }, [row]);

  if (!row) return null;

  function handleConfirm() {
    if (!isAggregate) {
      onIssue(row);
      onOpenChange(false);
      return;
    }
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

        <div className="flex flex-1 flex-col justify-center gap-5 overflow-y-auto">
          <div className="flex flex-col items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-6 py-8 text-center dark:border-neutral-800 dark:bg-neutral-800/50">
            <div>
              <p className="text-base font-semibold text-gray-900 dark:text-neutral-100">{row.unitId ?? row.itemName}</p>
              <p className="text-xs text-gray-400 dark:text-neutral-500">{row.unitId ? row.itemName : row.itemNo}</p>
            </div>
            {!isAggregate && <p className="text-2xl font-semibold tabular-nums text-gray-900 dark:text-neutral-100">{row.quantity}</p>}
          </div>

          {isAggregate && (
            <label className="flex flex-col gap-1">
              <span className={LABEL_CLS}>{t("issuePanel.quantityLabel")}</span>
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                placeholder={row.quantity}
                value={quantity}
                onChange={(e) => setQuantity(sanitizeQuantityInput(e.target.value))}
                className={FIELD_CLS}
              />
              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
            </label>
          )}
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

  useEffect(() => {
    if (!item) return;
    setSelected(new Set());
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
              <label
                key={u.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                <Checkbox checked={selected.has(u.id)} onCheckedChange={() => toggleUnit(u.id)} />
                <span className="font-medium">{u.unitId}</span>
                <span className="text-gray-400 dark:text-neutral-500">{u.quantity}</span>
              </label>
            ))}
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("issuePanel.cancel")}
          </Button>
          <Button
            size="sm"
            disabled={selected.size === 0}
            onClick={() => {
              onIssue(item, selected);
              onOpenChange(false);
            }}
          >
            {t("issueGroupPanel.confirm", { count: selected.size })}
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
}) {
  if (row.kind === "aggregate") {
    const item = row.item;
    const isGrouped = viewMode === "grouped";
    const actionRow = { kind: "aggregate", id: item.itemNo, itemNo: item.itemNo, itemName: item.itemName, quantity: item.totalQuantity, note: item.note };
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
    const actionRow = { kind: "unit", id: u.id, itemNo: item.itemNo, itemName: item.itemName, unitId: u.unitId, quantity: u.quantity, note: u.note };
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
    const actionRow = { kind: "unit", id: u.id, itemNo: item.itemNo, itemName: item.itemName, unitId: u.unitId, quantity: u.quantity, note: u.note };
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
    const itemEditRow = { kind: "item", id: item.itemNo, itemNo: item.itemNo, itemName: item.itemName, note: item.note };
    return (
      <TableRow onClick={() => onToggleItem(item.itemNo)} className="group cursor-pointer">
        <TableCell className="w-8 pl-8">
          {isGroupOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
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
        <TableCell className={`text-gray-600 dark:text-neutral-300 ${wrapCls(columnSizing, "quantity")}`}>{sumQuantity(item.units)}</TableCell>
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
      if (viewMode === "flat") {
        item.units.forEach((u) => list.push({ kind: "flatUnit", key: u.id, item, unit: u }));
        return;
      }
      if (item.units.length === 1) {
        list.push({ kind: "singleUnit", key: item.itemNo, item, unit: item.units[0] });
        return;
      }
      list.push({ kind: "groupParent", key: item.itemNo, item });
      if (expandedItems[item.itemNo]) {
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
          rows.push({ kind: "unit", id: u.id, itemNo: item.itemNo, itemName: item.itemName, unitId: u.unitId, unitType: u.unitType, quantity: u.quantity });
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
    const newUnit = { id: unit.id, unitType: unit.unitType, unitId: unit.unitId, quantity: unit.quantity, note: "-", cipStatus: "match" };
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

  // Same as handleCreate, batched - the bulk-receipt grid's "Zapisz" adds
  // every valid row at once instead of one at a time.
  function handleCreateBulk(units) {
    setItems((prev) => units.reduce((acc, unit) => receiveUnit(acc, unit), prev));
    setExpandedItems((prev) => {
      const next = { ...prev };
      units.forEach((unit) => {
        next[unit.itemNo] = true;
      });
      return next;
    });
    logOperation(units.map(historyEntryForReceipt));
    pushToast(t("toast.receivedBulk", { count: units.length }));
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
        return {
          ...it,
          itemName: patch.itemName ?? it.itemName,
          units: it.units.map((u) => (u.id === row.id ? { ...u, unitId: patch.unitId, quantity: patch.quantity, note: patch.note } : u)),
        };
      })
    );
  }

  // Pure reducer step shared by every issue path (single row, group
  // checklist, cross-item bulk): issuing everything that's left behaves
  // like before (the item/unit disappears); issuing less than what's
  // available just shrinks the remaining amount instead - for an
  // aggregate's total, and (bulk-issue only, where the quantity input is
  // editable for units too) for a single unit's own length/weight.
  function issueRow(itemsArr, row, quantity) {
    if (row.kind === "aggregate") {
      return itemsArr.flatMap((it) => {
        if (it.itemNo !== row.itemNo) return [it];
        const available = parseFloat(it.totalQuantity);
        const issued = quantity !== undefined ? parseFloat(quantity) : available;
        if (issued >= available) return [];
        const remaining = available - issued;
        const formatted = remaining % 1 === 0 ? String(remaining) : remaining.toFixed(3);
        return [{ ...it, totalQuantity: formatted }];
      });
    }
    return itemsArr
      .map((it) => {
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
      })
      .filter((it) => (it.trackedIndividually ? it.units.length > 0 : true));
  }

  function handleIssue(row, quantity) {
    const item = items.find((it) => it.itemNo === row.itemNo);
    setItems((prev) => issueRow(prev, row, quantity));
    logOperation([{ operation: "issue", itemNo: row.itemNo, itemName: row.itemName, unitId: row.unitId, quantity: quantity ?? row.quantity, location: item?.locationCode }]);
    pushToast(t("toast.issued", { itemName: row.itemName, quantity: quantity ?? row.quantity }));
  }

  // Same as handleIssue, batched - the group row's own "Wydaj" picks any
  // number of its units to issue at once instead of one at a time.
  function handleIssueUnits(item, unitIds) {
    const issuedUnits = item.units.filter((u) => unitIds.has(u.id));
    setItems((prev) =>
      prev
        .map((it) => (it.itemNo === item.itemNo ? { ...it, units: it.units.filter((u) => !unitIds.has(u.id)) } : it))
        .filter((it) => (it.trackedIndividually ? it.units.length > 0 : true))
    );
    logOperation(
      issuedUnits.map((u) => ({ operation: "issue", itemNo: item.itemNo, itemName: item.itemName, unitId: u.unitId, quantity: u.quantity, location: item.locationCode }))
    );
    pushToast(t("toast.issuedUnits", { count: unitIds.size, itemName: item.itemName }));
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
      const rows = filteredItems.flatMap((it) =>
        it.trackedIndividually
          ? it.units.map((u) => [it.itemNo, it.itemName, u.unitId, u.quantity, it.locationCode, it.note])
          : [[it.itemNo, it.itemName, "-", it.totalQuantity, it.locationCode, it.note]]
      );
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
              const selectionId = isGroupParent ? null : row.kind === "aggregate" ? row.item.itemNo : row.unit.id;
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
        onCreateBulk={handleCreateBulk}
        items={items}
        t={t}
      />
      <EditUnitPanel row={editingRow} open={Boolean(editingRow)} onOpenChange={(open) => !open && setEditingRow(null)} onSave={handleSave} t={t} />
      <IssueUnitPanel row={issuingRow} open={Boolean(issuingRow)} onOpenChange={(open) => !open && setIssuingRow(null)} onIssue={handleIssue} t={t} />
      <IssueGroupPanel
        item={issuingGroup}
        open={Boolean(issuingGroup)}
        onOpenChange={(open) => !open && setIssuingGroup(null)}
        onIssue={handleIssueUnits}
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
