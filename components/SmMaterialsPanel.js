"use client";

import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { Plus, Pencil, PackageMinus, Search, Disc3, Package, Download, ChevronDown, ChevronRight, Layers, List, Filter } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToastStack, useToastStack } from "@/components/ui/toast";
import { downloadStockXlsx } from "@/lib/xlsxExport";

// Sample data illustrating the concept discussed for this screen: CIP only
// stores an aggregate (item + location + quantity), so this table groups
// rows by that same CIP item - each item expands to the individual physical
// units kept only here (a spool's own number, a single bigbag's own weight)
// that CIP has no field for. A material CIP only ever tracks as one combined
// figure - e.g. thread sold by weight - has nothing to expand, so it's just
// a single row with a total (trackedIndividually: false). Nothing here
// persists anywhere yet - see the "note" copy in each panel.
const INITIAL_ITEMS = [
  {
    itemNo: "993916000000404",
    itemName: "Coated FRP 1.8/1.9-/-M",
    locationCode: "MT",
    note: "-",
    trackedIndividually: true,
    units: [{ id: "u1", unitType: "spool", unitId: "SZP-2231", quantity: "48.800", note: "-", cipStatus: "match" }],
  },
  {
    itemNo: "993916000000219",
    itemName: "FRP 1.8mm/VIP",
    locationCode: "ST 01",
    note: "-",
    trackedIndividually: true,
    units: [{ id: "u2", unitType: "spool", unitId: "SZP-2232", quantity: "51.200", note: "-", cipStatus: "match" }],
  },
  {
    itemNo: "993916000000239",
    itemName: "Coated FRP/1.3mm*1.4mm",
    locationCode: "MT",
    note: "-",
    trackedIndividually: true,
    units: [{ id: "u3", unitType: "spool", unitId: "SZP-2233", quantity: "12.400", note: "-", cipStatus: "match" }],
  },
  {
    itemNo: "FILLER-GRAY-1.6",
    itemName: "Filler GRAY 1.6mm",
    locationCode: "MT",
    note: "-",
    trackedIndividually: true,
    units: [
      { id: "u4", unitType: "bigbag", unitId: "BB-0091", quantity: "420", note: "-", cipStatus: "match" },
      { id: "u5", unitType: "bigbag", unitId: "BB-0092", quantity: "380", note: "-", cipStatus: "mismatch" },
    ],
  },
  {
    itemNo: "993916000000900",
    itemName: "Nici Aramid 1610",
    locationCode: "WS 01",
    note: "-",
    trackedIndividually: false,
    totalQuantity: "125",
  },
  // The rest below is pulled from Baza FRP's own item numbers/names (same
  // ones "Aktualna lista" shows), just relocated to MT for this concept.
  {
    itemNo: "993916000000115",
    itemName: "FRP/Φ3.7mm",
    locationCode: "MT",
    note: "-",
    trackedIndividually: true,
    units: [{ id: "u6", unitType: "spool", unitId: "F109", quantity: "4.091", note: "-", cipStatus: "match" }],
  },
  {
    itemNo: "993916000000304",
    itemName: "FRP 3.5mm/VIP",
    locationCode: "MT",
    note: "-",
    trackedIndividually: true,
    units: [
      { id: "u7", unitType: "spool", unitId: "Y004", quantity: "4.334", note: "-", cipStatus: "match" },
      { id: "u8", unitType: "spool", unitId: "Y310", quantity: "3.076", note: "-", cipStatus: "match" },
    ],
  },
  {
    itemNo: "993916000000129",
    itemName: "Coated FRP/1.8*1.9-/-M",
    locationCode: "MT",
    note: "-",
    trackedIndividually: true,
    units: [{ id: "u9", unitType: "spool", unitId: "G612", quantity: "1.570", note: "-", cipStatus: "match" }],
  },
  {
    itemNo: "993916000000128",
    itemName: "Coated FRP/1.6*1.7-/-M",
    locationCode: "MT",
    note: "-",
    trackedIndividually: true,
    units: [{ id: "u10", unitType: "spool", unitId: "G616", quantity: "12.731", note: "-", cipStatus: "match" }],
  },
  {
    itemNo: "993916000000009",
    itemName: "FRP/Φ1.2mm",
    locationCode: "MT",
    note: "-",
    trackedIndividually: true,
    units: [{ id: "u11", unitType: "spool", unitId: "H221", quantity: "6.850", note: "-", cipStatus: "match" }],
  },
  {
    itemNo: "993916000000310",
    itemName: "FRP 1.4mm/VIP",
    locationCode: "MT",
    note: "-",
    trackedIndividually: true,
    units: [
      { id: "u12", unitType: "spool", unitId: "H305", quantity: "9.220", note: "-", cipStatus: "match" },
      { id: "u13", unitType: "spool", unitId: "H306", quantity: "8.940", note: "-", cipStatus: "match" },
    ],
  },
  {
    itemNo: "993916000000254",
    itemName: "Coated FRP 1.6*1.7-H-M (High Module)",
    locationCode: "MT",
    note: "-",
    trackedIndividually: true,
    units: [{ id: "u14", unitType: "spool", unitId: "H412", quantity: "3.205", note: "-", cipStatus: "mismatch" }],
  },
  {
    itemNo: "993916000000307",
    itemName: "FRP 3.0mm/VIP",
    locationCode: "MT",
    note: "-",
    trackedIndividually: true,
    units: [{ id: "u15", unitType: "spool", unitId: "H528", quantity: "5.610", note: "-", cipStatus: "match" }],
  },
  {
    itemNo: "993916000000059",
    itemName: "High-strength FRP/1.8mm (for top telecom contract)",
    locationCode: "MT",
    note: "-",
    trackedIndividually: true,
    units: [{ id: "u16", unitType: "spool", unitId: "H601", quantity: "2.980", note: "-", cipStatus: "match" }],
  },
  {
    itemNo: "993916000000468",
    itemName: "FRP with steel wire reinforced Φ0.45*3.0mm",
    locationCode: "MT",
    note: "-",
    trackedIndividually: true,
    units: [{ id: "u17", unitType: "spool", unitId: "H733", quantity: "7.150", note: "-", cipStatus: "match" }],
  },
];

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
  "h-10 w-full rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-neutral-100 focus:border-navy-700 dark:focus:border-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400 disabled:opacity-60 disabled:cursor-not-allowed";
const LABEL_CLS = "text-xs font-medium text-gray-500 dark:text-neutral-400";
const ROW_ACTION_CLS =
  "rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200";
const UNIT_TYPE_ICON_CLS = {
  spool: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400",
  bigbag: "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400",
};

function UnitTypeIcon({ unitType }) {
  const Icon = unitType === "spool" ? Disc3 : Package;
  return (
    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${UNIT_TYPE_ICON_CLS[unitType]}`}>
      <Icon className="h-4 w-4" />
    </span>
  );
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
function ReceiveUnitPanel({ open, onOpenChange, onCreate, t }) {
  const [itemNo, setItemNo] = useState("");
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitId, setUnitId] = useState("");

  useEffect(() => {
    if (!open) return;
    setItemNo("");
    setItemName("");
    setQuantity("");
    setUnitId("");
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
    });
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("receivePanel.title")}</SheetTitle>
          <SheetDescription>{t("receivePanel.description")}</SheetDescription>
        </SheetHeader>

        <form id="receive-unit-form" onSubmit={handleSubmit} className="flex flex-1 flex-col gap-3 overflow-y-auto">
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>{t("receivePanel.itemNoLabel")}</span>
            <input className={FIELD_CLS} value={itemNo} onChange={(e) => setItemNo(e.target.value)} />
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
              placeholder="np. 48.800"
              value={quantity}
              onChange={(e) => setQuantity(sanitizeQuantityInput(e.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>{t("receivePanel.locationLabel")}</span>
            <input className={FIELD_CLS} value="MT" disabled />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>{t("receivePanel.unitIdLabel")}</span>
            <input
              className={FIELD_CLS}
              placeholder={t("receivePanel.unitIdPlaceholder")}
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
            />
          </label>

          <p className="text-xs text-gray-400 dark:text-neutral-500">{t("receivePanel.note")}</p>
        </form>

        <SheetFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("receivePanel.cancel")}
          </Button>
          <Button type="submit" form="receive-unit-form" size="sm">
            {t("receivePanel.save")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
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
          <SheetDescription>{t("editPanel.description")}</SheetDescription>
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("issuePanel.title")}</SheetTitle>
          <SheetDescription>{t("issuePanel.description")}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
          <UnitInfo row={row} t={t} />
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
          <p className="text-xs text-gray-400 dark:text-neutral-500">
            {t(isAggregate ? "issuePanel.noteAggregate" : "issuePanel.note")}
          </p>
        </div>

        <SheetFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("issuePanel.cancel")}
          </Button>
          <Button size="sm" onClick={handleConfirm}>
            {t("issuePanel.confirm")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
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
          <SheetDescription>{t("issueGroupPanel.description")}</SheetDescription>
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
                <UnitTypeIcon unitType={u.unitType} />
                <span className="font-medium">{u.unitId}</span>
                <span className="text-gray-400 dark:text-neutral-500">{u.quantity}</span>
              </label>
            ))}
          </div>

          <p className="text-xs text-gray-400 dark:text-neutral-500">{t("issueGroupPanel.note")}</p>
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
    setQuantities({});
    setErrors({});
  }, [open]);

  function setQuantity(id, value) {
    setQuantities((prev) => ({ ...prev, [id]: sanitizeQuantityInput(value) }));
    setErrors((prev) => (prev[id] ? { ...prev, [id]: undefined } : prev));
  }

  function handleConfirm() {
    const nextErrors = {};
    rows.forEach((row) => {
      if (row.kind !== "aggregate") return;
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
    onIssue(rows.map((row) => ({ row, quantity: row.kind === "aggregate" ? quantities[row.id]?.trim() || undefined : undefined })));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("bulkIssuePanel.title")}</DialogTitle>
          <DialogDescription>{t("bulkIssuePanel.description", { count: rows.length })}</DialogDescription>
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
                    <input
                      type="text"
                      inputMode="decimal"
                      disabled={row.kind !== "aggregate"}
                      placeholder={row.quantity}
                      value={row.kind === "aggregate" ? quantities[row.id] ?? "" : row.quantity}
                      onChange={(e) => setQuantity(row.id, e.target.value)}
                      className={`${FIELD_CLS} h-9 w-28 text-right`}
                    />
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

export default function SmMaterialsPanel() {
  const t = useTranslations("materialsListSm");
  const tActions = useTranslations("stock.actions");
  const tStock = useTranslations("stock");
  const [items, setItems] = useState(INITIAL_ITEMS);
  const [search, setSearch] = useState("");
  // Table filters: narrow the already-loaded items.
  const [columnFilters, setColumnFilters] = useState({ itemName: "", note: "", quantityMin: "", quantityMax: "" });
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

  // Plain drag-to-resize, seeded with the header's measured on-screen width
  // (via flushSync, same trick MaterialsTable.js uses) so the column starts
  // from where it visually is instead of jumping to a default the instant
  // you grab the handle. No TanStack model here, so width is tracked by
  // column id and applied only to the <TableHead> - the column's cells
  // follow its resolved width automatically.
  function startResize(event, columnId) {
    event.preventDefault();
    event.stopPropagation();
    const pointerEvent = event.touches?.[0] ?? event;
    const startX = pointerEvent.clientX;
    const thElement = event.currentTarget.closest("th");
    const startWidth = columnSizing[columnId] ?? thElement?.getBoundingClientRect().width ?? 150;

    if (columnSizing[columnId] === undefined) {
      flushSync(() => setColumnSizing((prev) => ({ ...prev, [columnId]: startWidth })));
    }

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

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const nameQuery = columnFilters.itemName.trim().toLowerCase();
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
      if (nameQuery && !it.itemName.toLowerCase().includes(nameQuery)) return false;
      if (noteQuery && !(it.note ?? "").toLowerCase().includes(noteQuery)) return false;
      const qty = itemQuantityValue(it);
      if (!Number.isNaN(min) && qty < min) return false;
      if (!Number.isNaN(max) && qty > max) return false;
      return true;
    });
  }, [items, search, columnFilters]);

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

  function handleCreate(unit) {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.itemNo === unit.itemNo);
      const newUnit = { id: unit.id, unitType: unit.unitType, unitId: unit.unitId, quantity: unit.quantity, note: "-", cipStatus: "match" };
      if (idx === -1) {
        return [
          { itemNo: unit.itemNo, itemName: unit.itemName, locationCode: "MT", note: "-", trackedIndividually: true, units: [newUnit] },
          ...prev,
        ];
      }
      const next = [...prev];
      next[idx] = { ...next[idx], units: [newUnit, ...next[idx].units] };
      return next;
    });
    setExpandedItems((prev) => ({ ...prev, [unit.itemNo]: true }));
    pushToast(t("toast.received", { itemName: unit.itemName, quantity: unit.quantity }));
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
  // like before (the item/unit disappears); issuing less than an
  // aggregate's total just shrinks its remaining amount instead.
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
      .map((it) => (it.itemNo === row.itemNo ? { ...it, units: it.units.filter((u) => u.id !== row.id) } : it))
      .filter((it) => (it.trackedIndividually ? it.units.length > 0 : true));
  }

  function handleIssue(row, quantity) {
    setItems((prev) => issueRow(prev, row, quantity));
    pushToast(t("toast.issued", { itemName: row.itemName, quantity: quantity ?? row.quantity }));
  }

  // Same as handleIssue, batched - the group row's own "Wydaj" picks any
  // number of its units to issue at once instead of one at a time.
  function handleIssueUnits(item, unitIds) {
    setItems((prev) =>
      prev
        .map((it) => (it.itemNo === item.itemNo ? { ...it, units: it.units.filter((u) => !unitIds.has(u.id)) } : it))
        .filter((it) => (it.trackedIndividually ? it.units.length > 0 : true))
    );
    pushToast(t("toast.issuedUnits", { count: unitIds.size, itemName: item.itemName }));
  }

  // Cross-item bulk issue - each selected leaf row (unit or whole
  // aggregate item), issued in sequence over the same running items array.
  function handleBulkIssue(entries) {
    setItems((prev) => entries.reduce((acc, { row, quantity }) => issueRow(acc, row, quantity), prev));
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
            className="h-9 w-full rounded-lg border-none bg-gray-100 dark:bg-neutral-800 pl-9 pr-3 text-sm text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400"
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
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setReceiveOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("addReceipt")}
          </Button>
        </div>
      </div>

      <div className="mt-4 -mx-8">
        <Table containerClassName="max-h-[60vh] overflow-y-auto">
          <TableHeader>
            <TableRow className="border-b border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800">
              <TableHead className="sticky top-0 z-10 w-10 bg-gray-50 pl-8 dark:bg-neutral-800">
                <Checkbox
                  checked={allSelected}
                  indeterminate={someSelected && !allSelected}
                  onCheckedChange={(value) => toggleSelectAll(Boolean(value))}
                />
              </TableHead>
              <TableHead
                style={headStyle("itemNo")}
                className="sticky top-0 z-10 bg-gray-50 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:bg-neutral-800 dark:text-neutral-500"
              >
                {t("columns.itemNo")}
                <ResizeHandle columnId="itemNo" />
              </TableHead>
              <TableHead
                style={headStyle("itemName")}
                className="sticky top-0 z-10 bg-gray-50 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:bg-neutral-800 dark:text-neutral-500"
              >
                <Popover>
                  <PopoverTrigger
                    render={
                      <button type="button" className="flex items-center gap-1">
                        <span>{t("columns.itemName")}</span>
                        <Filter
                          className={`h-3 w-3 shrink-0 ${
                            hasColumnFilter("itemName") ? "text-navy-600 dark:text-navy-300" : "text-gray-400 dark:text-neutral-500"
                          }`}
                        />
                      </button>
                    }
                  />
                  <PopoverContent align="start" className="w-56">
                    <input
                      type="text"
                      autoFocus
                      value={columnFilters.itemName}
                      onChange={(e) => setColumnFilter("itemName", e.target.value)}
                      placeholder={t("tableFilters.namePlaceholder")}
                      className={FIELD_CLS}
                    />
                    {hasColumnFilter("itemName") && (
                      <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => clearColumnFilter("itemName")}>
                        {t("tableFilters.clear")}
                      </Button>
                    )}
                  </PopoverContent>
                </Popover>
                <ResizeHandle columnId="itemName" />
              </TableHead>
              {viewMode === "flat" && (
                <TableHead
                  style={headStyle("materialNumber")}
                  className="sticky top-0 z-10 bg-gray-50 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:bg-neutral-800 dark:text-neutral-500"
                >
                  {t("columns.materialNumber")}
                  <ResizeHandle columnId="materialNumber" />
                </TableHead>
              )}
              <TableHead
                style={headStyle("quantity")}
                className="sticky top-0 z-10 bg-gray-50 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:bg-neutral-800 dark:text-neutral-500"
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
                style={headStyle("location")}
                className="sticky top-0 z-10 bg-gray-50 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:bg-neutral-800 dark:text-neutral-500"
              >
                {t("columns.location")}
                <ResizeHandle columnId="location" />
              </TableHead>
              <TableHead
                style={headStyle("note")}
                className="sticky top-0 z-10 bg-gray-50 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:bg-neutral-800 dark:text-neutral-500"
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
              <TableHead className="sticky top-0 z-10 w-0 bg-gray-50 pr-8 dark:bg-neutral-800" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.flatMap((item) => {
              if (!item.trackedIndividually) {
                const row = { kind: "aggregate", id: item.itemNo, itemNo: item.itemNo, itemName: item.itemName, quantity: item.totalQuantity, note: item.note };
                return [
                  <TableRow key={item.itemNo} data-state={selectedIds.has(item.itemNo) ? "selected" : undefined}>
                    <TableCell className="pl-8">
                      <Checkbox checked={selectedIds.has(item.itemNo)} onCheckedChange={(value) => setRowSelected(item.itemNo, Boolean(value))} />
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-neutral-300">{item.itemNo}</TableCell>
                    <TableCell className="text-gray-600 dark:text-neutral-300">{item.itemName}</TableCell>
                    {viewMode === "flat" && <TableCell className="text-gray-400 dark:text-neutral-500">-</TableCell>}
                    <TableCell className="text-gray-600 dark:text-neutral-300">{item.totalQuantity}</TableCell>
                    <TableCell className="text-gray-600 dark:text-neutral-300">{item.locationCode}</TableCell>
                    <TableCell className="text-gray-400 dark:text-neutral-500">{item.note}</TableCell>
                    <TableCell className="pr-8">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" title={t("actions.edit")} onClick={() => setEditingRow(row)} className={ROW_ACTION_CLS}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button type="button" title={t("actions.issue")} onClick={() => setIssuingRow(row)} className={ROW_ACTION_CLS}>
                          <PackageMinus className="h-4 w-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>,
                ];
              }

              if (viewMode === "flat") {
                return item.units.map((u) => {
                  const row = { kind: "unit", id: u.id, itemNo: item.itemNo, itemName: item.itemName, unitId: u.unitId, quantity: u.quantity, note: u.note };
                  return (
                    <TableRow key={u.id} data-state={selectedIds.has(u.id) ? "selected" : undefined}>
                      <TableCell className="pl-8">
                        <Checkbox checked={selectedIds.has(u.id)} onCheckedChange={(value) => setRowSelected(u.id, Boolean(value))} />
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-neutral-300">
                        <div className="flex items-center gap-2">
                          <UnitTypeIcon unitType={u.unitType} />
                          {item.itemNo}
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-600 dark:text-neutral-300">{item.itemName}</TableCell>
                      <TableCell className="text-gray-600 dark:text-neutral-300">{u.unitId}</TableCell>
                      <TableCell className="text-gray-600 dark:text-neutral-300">{u.quantity}</TableCell>
                      <TableCell className="text-gray-600 dark:text-neutral-300">{item.locationCode}</TableCell>
                      <TableCell className="text-gray-400 dark:text-neutral-500">{u.note}</TableCell>
                      <TableCell className="pr-8">
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" title={t("actions.edit")} onClick={() => setEditingRow(row)} className={ROW_ACTION_CLS}>
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button type="button" title={t("actions.issue")} onClick={() => setIssuingRow(row)} className={ROW_ACTION_CLS}>
                            <PackageMinus className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                });
              }

              const isOpen = Boolean(expandedItems[item.itemNo]);
              const itemAllSelected = item.units.length > 0 && item.units.every((u) => selectedIds.has(u.id));
              const itemSomeSelected = item.units.some((u) => selectedIds.has(u.id));
              const itemEditRow = { kind: "item", id: item.itemNo, itemNo: item.itemNo, itemName: item.itemName, note: item.note };

              const itemRow = (
                <TableRow
                  key={item.itemNo}
                  onClick={() => toggleItem(item.itemNo)}
                  className="cursor-pointer bg-gray-50/60 hover:bg-gray-100 dark:bg-neutral-800/30 dark:hover:bg-neutral-800/60"
                >
                  <TableCell className="pl-8" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={itemAllSelected}
                      indeterminate={itemSomeSelected && !itemAllSelected}
                      onCheckedChange={(value) => setItemSelected(item, Boolean(value))}
                    />
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-neutral-300">
                    <span className="inline-flex items-center gap-1.5">
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
                      {item.itemNo}
                    </span>
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-neutral-300">{item.itemName}</TableCell>
                  <TableCell className="text-gray-600 dark:text-neutral-300">{sumQuantity(item.units)}</TableCell>
                  <TableCell className="text-gray-600 dark:text-neutral-300">{item.locationCode}</TableCell>
                  <TableCell className="text-gray-400 dark:text-neutral-500">{item.note}</TableCell>
                  <TableCell className="pr-8" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" title={t("actions.edit")} onClick={() => setEditingRow(itemEditRow)} className={ROW_ACTION_CLS}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button type="button" title={t("actions.issue")} onClick={() => setIssuingGroup(item)} className={ROW_ACTION_CLS}>
                        <PackageMinus className="h-4 w-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              );

              if (!isOpen) return [itemRow];

              return [
                itemRow,
                ...item.units.map((u) => {
                  const row = { kind: "unit", id: u.id, itemNo: item.itemNo, itemName: item.itemName, unitId: u.unitId, quantity: u.quantity, note: u.note };
                  return (
                    <TableRow key={u.id} data-state={selectedIds.has(u.id) ? "selected" : undefined}>
                      <TableCell className="pl-8">
                        <Checkbox checked={selectedIds.has(u.id)} onCheckedChange={(value) => setRowSelected(u.id, Boolean(value))} />
                      </TableCell>
                      <TableCell className="pl-6">
                        <span className="inline-flex items-center gap-2 text-gray-700 dark:text-neutral-200">
                          <UnitTypeIcon unitType={u.unitType} />
                          {u.unitId}
                        </span>
                      </TableCell>
                      <TableCell />
                      <TableCell className="text-gray-600 dark:text-neutral-300">{u.quantity}</TableCell>
                      <TableCell className="text-gray-600 dark:text-neutral-300">{item.locationCode}</TableCell>
                      <TableCell className="text-gray-400 dark:text-neutral-500">{u.note}</TableCell>
                      <TableCell className="pr-8">
                        <div className="flex items-center justify-end gap-1">
                          <button type="button" title={t("actions.edit")} onClick={() => setEditingRow(row)} className={ROW_ACTION_CLS}>
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button type="button" title={t("actions.issue")} onClick={() => setIssuingRow(row)} className={ROW_ACTION_CLS}>
                            <PackageMinus className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }),
              ];
            })}
          </TableBody>
        </Table>
      </div>

      {selectedIds.size > 0 && (
        <p className="mt-2 pl-1 text-xs text-gray-500 dark:text-neutral-400">
          {tStock("selectedCount", { count: selectedIds.size, total: leafIds.length })}
        </p>
      )}

      <ReceiveUnitPanel open={receiveOpen} onOpenChange={setReceiveOpen} onCreate={handleCreate} t={t} />
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
