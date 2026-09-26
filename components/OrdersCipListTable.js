"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Cable, ChevronDown, ChevronRight, Droplets, ImagePlus, Package, Plus, Trash2, Truck, Undo2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import FrpFilters from "@/components/FrpFilters";
import { ORDERS_CIP_SEED } from "@/lib/ordersCipSeed";
import { smCatalogApi } from "@/lib/smCatalogApi";
import { getCipSession } from "@/lib/cipSession";
import { sanitizeQuantityInput } from "@/lib/quantityInput";

// Same real line codes as ordersCipSeed.js's own data (see that file's
// comment) - SH01-07, ST01-13, FC01-03, FL01, not a made-up "Linia 1/2/3/4".
const LINE_CODES = [
  ...Array.from({ length: 7 }, (_, i) => `SH0${i + 1}`),
  ...Array.from({ length: 13 }, (_, i) => `ST${String(i + 1).padStart(2, "0")}`),
  "FC01",
  "FC02",
  "FC03",
  "FL01",
];

// What each type of order asks for - the "Nowe zamówienie" menu lists these in
// this order. `from`/`to` are line codes (the only places there are), `water`
// is the clean/dirty choice, `photo` one optional picture picked from the computer,
// `productionOrderNo` the one production order the
// whole order is filled under, `items` a list of catalog materials with a
// quantity. Mirrors wpsApi's src/orders.draft.sql (see its AGENTS.md); the
// inputs per type are still being decided, so this is the one place to change.
// "Zamówienie szpul" has no agreed inputs yet - it asks like a material order,
// minus the production order number.
// `icon`/`iconTone` are only for the menu: each type has its own icon and
// colour (blue, pink, gray, orange, yellow, green from top to bottom), the icon
// alone with no background. The colour carries a trailing "!" (Tailwind v4
// important) because a focused menu item recolours all its descendants, which
// would otherwise wipe it out on hover.
const ORDER_TYPES = [
  { code: "water_refill", fields: ["to", "water"], icon: Droplets, iconTone: "text-blue-600! dark:text-blue-400!" },
  { code: "material_order", fields: ["to", "productionOrderNo", "items"], icon: Package, iconTone: "text-pink-600! dark:text-pink-400!" },
  { code: "spool_order", fields: ["to", "items"], icon: Cable, iconTone: "text-gray-600! dark:text-neutral-300!" },
  { code: "goods_transport", fields: ["from", "to", "photo"], freeText: true, icon: Truck, iconTone: "text-orange-600! dark:text-orange-400!" },
  { code: "waste_removal", fields: ["from", "photo"], icon: Trash2, iconTone: "text-yellow-600! dark:text-yellow-400!" },
  { code: "warehouse_return", fields: ["from", "photo"], icon: Undo2, iconTone: "text-green-600! dark:text-green-400!" },
];

// `freeText`: "skąd"/"dokąd" are not limited to the production lines - they
// suggest every place known so far (the fixed lines plus any typed on an earlier
// order) and accept a new one, which then joins the suggestions.
// The "from" line is asked differently per type.
const FROM_LABEL_KEY = { goods_transport: "from", waste_removal: "place", warehouse_return: "collectFrom" };

const FIELD_CLS =
  "h-10 w-full rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-neutral-100 focus:border-navy-700 dark:focus:border-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400";
const LABEL_CLS = "text-xs font-medium text-gray-500 dark:text-neutral-400";

function RequiredMark() {
  return <span className="text-red-600 dark:text-red-400"> *</span>;
}

// Next sequential order number for the current year - ZM/<year>/<4-digit
// running number> matching the seed's own format (see ordersCipSeed.js).
function nextOrderNo(existingOrders) {
  const year = new Date().getFullYear();
  const highest = existingOrders.reduce((max, o) => {
    const match = o.orderNo.match(/(\d+)$/);
    return match ? Math.max(max, parseInt(match[1], 10)) : max;
  }, 0);
  return `ZM/${year}/${String(highest + 1).padStart(4, "0")}`;
}

// "Skąd → dokąd" when an order has both, else the one line it concerns.
function routeLabel(order) {
  if (order.from && order.to) return `${order.from} → ${order.to}`;
  return order.line ?? order.to ?? order.from ?? "-";
}

// Type-specific values worth showing under an expanded order.
function detailLines(order, t) {
  const lines = [];
  if (order.details?.water) lines.push(`${t("details.water")}: ${t(order.details.water === "clean" ? "details.clean" : "details.dirty")}`);
  if (order.details?.productionOrderNo) lines.push(`${t("details.productionOrderNo")}: ${order.details.productionOrderNo}`);
  return lines;
}

// A place field with suggestions: the shared pool of every place known so far
// (same list for everyone - not personalised), filtered by what is typed, and any
// other text is accepted as it is (a new place - it is saved with the order and
// suggested from then on, no caption about it). The list floats over the form and
// only shows once something is typed. Suggestions come from `locations`.
function LocationInput({ label, value, onChange, locations, t }) {
  const [open, setOpen] = useState(false);
  const needle = value.trim().toLowerCase();
  const matches = useMemo(
    () => locations.filter((name) => !needle || name.toLowerCase().includes(needle)).slice(0, 8),
    [locations, needle]
  );

  return (
    <label className="relative flex flex-col gap-1">
      <span className={LABEL_CLS}>
        {label}
        <RequiredMark />
      </span>
      <input
        className={FIELD_CLS}
        value={value}
        placeholder={t("newOrderPanel.locationPlaceholder")}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && needle !== "" && matches.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          {matches.map((name) => (
            <button
              key={name}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(name);
                setOpen(false);
              }}
              className="flex w-full items-center px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50 dark:text-neutral-100 dark:hover:bg-neutral-800"
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </label>
  );
}

const EMPTY_FORM = { from: "", to: "", water: "", productionOrderNo: "", note: "" };

// "Nowe zamówienie": the form of one order type (see ORDER_TYPES). Materials
// are added one at a time by searching the same reference catalog Materiały SM
// uses (sm_catalog, via smCatalogApi) - the unit comes along for free instead
// of the operator having to know it. Local-only, same as the rest of this
// table (see the component's own comment) - onCreate just prepends a plain
// order object, no backend call. No photo field yet: where photos are stored
// is undecided (see wpsApi's AGENTS.md).
function NewOrderPanel({ type, locations, onClose, onCreate, t }) {
  // While the dialog fades out `type` is already null - keep showing the type it
  // had, or the fading form would flash the first type's fields.
  const shownType = useRef(type);
  if (type) shownType.current = type;
  const config = ORDER_TYPES.find((entry) => entry.code === (type ?? shownType.current)) ?? ORDER_TYPES[0];
  const has = (field) => config.fields.includes(field);
  const open = Boolean(type);
  const [form, setForm] = useState(EMPTY_FORM);
  const [catalog, setCatalog] = useState([]);
  const [rows, setRows] = useState([]);
  const [itemSearch, setItemSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  // { name, url } - url is a blob: URL of the picked file, only living in this
  // browser tab (no upload: where photos are stored is undecided).
  const [photo, setPhoto] = useState(null);
  const [photoError, setPhotoError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setRows([]);
    setItemSearch("");
    setPickerOpen(false);
    setPhotoError("");
    // A photo picked but never sent is let go of; a sent one was handed to the
    // order and this state cleared, so it is not revoked here.
    setPhoto((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, [open, type]);

  function pickPhoto(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError(t("newOrderPanel.photo.notImage"));
      return;
    }
    setPhotoError("");
    setPhoto((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { name: file.name, url: URL.createObjectURL(file) };
    });
  }

  function removePhoto() {
    setPhotoError("");
    setPhoto((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  // Fetched fresh every time a materials form opens (not cached at the page
  // level, unlike Materiały SM's own copy of this same list) - this panel is
  // opened rarely enough that a stale catalog from earlier in the session
  // isn't worth the extra prop plumbing.
  useEffect(() => {
    if (!open || !has("items")) return;
    smCatalogApi.list().then(setCatalog).catch(() => {});
  }, [open, type]);

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const matches = useMemo(() => {
    const needle = itemSearch.trim().toLowerCase();
    if (!needle) return [];
    return catalog
      .filter((entry) => !rows.some((row) => row.itemNo === entry.itemNo))
      .filter((entry) => entry.itemNo.toLowerCase().includes(needle) || entry.itemName.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [catalog, itemSearch, rows]);

  function addItem(entry) {
    setRows((prev) => [...prev, { itemNo: entry.itemNo, itemName: entry.itemName, unit: entry.unit, quantity: "" }]);
    setItemSearch("");
    setPickerOpen(false);
  }

  function updateQuantity(itemNo, value) {
    setRows((prev) => prev.map((row) => (row.itemNo === itemNo ? { ...row, quantity: sanitizeQuantityInput(value) } : row)));
  }

  function removeRow(itemNo) {
    setRows((prev) => prev.filter((row) => row.itemNo !== itemNo));
  }

  const validRows = rows.filter((row) => parseFloat(row.quantity) > 0);
  const canSubmit =
    (!has("to") || Boolean(form.to.trim())) &&
    (!has("from") || Boolean(form.from.trim())) &&
    (!(has("from") && has("to")) || form.from.trim().toLowerCase() !== form.to.trim().toLowerCase()) &&
    (!has("water") || Boolean(form.water)) &&
    (!has("productionOrderNo") || Boolean(form.productionOrderNo.trim())) &&
    (!has("items") || validRows.length > 0);

  async function handleSubmit() {
    if (!canSubmit) return;
    const session = await getCipSession().catch(() => null);
    const details = {};
    if (has("water")) details.water = form.water;
    if (has("productionOrderNo")) details.productionOrderNo = form.productionOrderNo.trim();
    // A typed place that matches a known one (any capitals) takes the known
    // spelling, so "sh01" does not become a second place next to "SH01".
    const canonical = (value) => locations.find((name) => name.toLowerCase() === value.trim().toLowerCase()) ?? value.trim();
    onCreate({
      type: config.code,
      from: has("from") ? canonical(form.from) : null,
      to: has("to") ? canonical(form.to) : null,
      details,
      note: form.note.trim(),
      photo: has("photo") ? photo : null,
      employeeNo: session?.userId ?? "",
      items: has("items")
        ? validRows.map((row) => ({ itemNo: row.itemNo, itemName: row.itemName, quantity: row.quantity, unit: row.unit, note: "-" }))
        : [],
    });
    setPhoto(null); // now owned by the order
    onClose();
  }

  const lineSelect = (field, label) => (
    <label className="flex flex-col gap-1">
      <span className={LABEL_CLS}>
        {label}
        <RequiredMark />
      </span>
      <select className={FIELD_CLS} value={form[field]} onChange={(e) => setField(field, e.target.value)}>
        <option value="">{t("newOrderPanel.linePlaceholder")}</option>
        {LINE_CODES.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>
    </label>
  );

  // "Skąd" and "dokąd" together sit in one row - [skąd] -> [dokąd].
  const inRow = has("from") && has("to");
  // Lines only, or - for the free-text type - suggestions + any typed place.
  const locationField = (field, label) =>
    config.freeText ? (
      <LocationInput label={label} value={form[field]} onChange={(value) => setField(field, value)} locations={locations} t={t} />
    ) : (
      lineSelect(field, label)
    );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("newOrderPanel.titleFor", { type: t(`types.${config.code}`) })}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-3">
          {/* TODO(frequent routes): a "Częste trasy" strip goes here, above the
              form - the routes this user orders most, one tap fills skąd + dokąd.
              Not built yet; the suggestions below are the same list for everyone
              (not per user), so there is nothing personal to show. When it comes,
              rank by this user's own past orders (requested_by), newest first. */}
          {inRow ? (
            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
                {locationField("from", t(`newOrderPanel.fields.${FROM_LABEL_KEY[config.code] ?? "from"}`))}
                {/* mt-5 = the label row above the inputs, so the arrow sits level with them */}
                <div className="mt-5 flex h-10 items-center text-gray-400 dark:text-neutral-500">
                  <ArrowRight className="h-4 w-4" />
                </div>
                {locationField("to", t("newOrderPanel.fields.toShort"))}
            </div>
          ) : (
            <>
              {has("from") && locationField("from", t(`newOrderPanel.fields.${FROM_LABEL_KEY[config.code] ?? "from"}`))}
              {has("to") && locationField("to", t("newOrderPanel.fields.to"))}
            </>
          )}

          {has("water") && (
            <div className="flex flex-col gap-1">
              <span className={LABEL_CLS}>
                {t("details.water")}
                <RequiredMark />
              </span>
              <div className="inline-flex items-center gap-1 self-start rounded-lg border border-gray-200 bg-gray-100 p-1 dark:border-neutral-700 dark:bg-neutral-800">
                {["clean", "dirty"].map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setField("water", kind)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      form.water === kind
                        ? "bg-white text-navy-950 shadow-sm dark:bg-neutral-900 dark:text-white"
                        : "text-gray-500 hover:text-gray-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                    }`}
                  >
                    {t(`details.${kind}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {has("productionOrderNo") && (
            <label className="flex flex-col gap-1">
              <span className={LABEL_CLS}>
                {t("details.productionOrderNo")}
                <RequiredMark />
              </span>
              <input className={FIELD_CLS} value={form.productionOrderNo} onChange={(e) => setField("productionOrderNo", e.target.value)} />
            </label>
          )}

          {has("items") && (
            <label className="relative flex flex-col gap-1">
              <span className={LABEL_CLS}>
                {t("newOrderPanel.addItemLabel")}
                <RequiredMark />
              </span>
              <input
                className={FIELD_CLS}
                value={itemSearch}
                onChange={(e) => {
                  setItemSearch(e.target.value);
                  setPickerOpen(true);
                }}
                onFocus={() => setPickerOpen(true)}
                onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
                placeholder={t("newOrderPanel.addItemPlaceholder")}
              />
              {pickerOpen && itemSearch.trim() && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                  {matches.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-gray-400 dark:text-neutral-500">{t("newOrderPanel.noMatches")}</p>
                  ) : (
                    matches.map((entry) => (
                      <button
                        key={entry.itemNo}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addItem(entry)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-neutral-800"
                      >
                        <span className="truncate">
                          <span className="font-medium text-gray-900 dark:text-neutral-100">{entry.itemName}</span>
                          <span className="ml-1.5 text-gray-400 dark:text-neutral-500">{entry.itemNo}</span>
                        </span>
                        {entry.unit && <span className="shrink-0 text-xs text-gray-400 dark:text-neutral-500">{entry.unit}</span>}
                      </button>
                    ))
                  )}
                </div>
              )}
            </label>
          )}

          {has("items") && rows.length > 0 && (
            <div className="flex max-h-44 flex-col gap-1 overflow-y-auto">
              {rows.map((row) => (
                <div key={row.itemNo} className="flex items-center gap-2 rounded-lg bg-gray-50 dark:bg-neutral-800/50 px-3 py-1.5 text-sm">
                  <div className="flex-1 truncate">
                    <span className="font-medium text-gray-900 dark:text-neutral-100">{row.itemName}</span>
                    <span className="ml-1.5 text-gray-400 dark:text-neutral-500">{row.itemNo}</span>
                  </div>
                  <input
                    className="h-8 w-24 rounded-md border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 text-right text-sm tabular-nums text-gray-900 dark:text-neutral-100 focus:border-navy-700 dark:focus:border-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400"
                    inputMode="decimal"
                    autoFocus
                    placeholder="0"
                    value={row.quantity}
                    onChange={(e) => updateQuantity(row.itemNo, e.target.value)}
                  />
                  {row.unit && <span className="w-8 shrink-0 text-xs text-gray-400 dark:text-neutral-500">{row.unit}</span>}
                  <button
                    type="button"
                    onClick={() => removeRow(row.itemNo)}
                    className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:text-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
                    title={t("newOrderPanel.removeRow")}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {has("photo") && (
            <div className="flex flex-col gap-1">
              <span className={LABEL_CLS}>{t("newOrderPanel.photo.label")}</span>
              {photo ? (
                <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-2 dark:border-neutral-700">
                  <img src={photo.url} alt={photo.name} className="h-16 w-16 shrink-0 rounded-md object-cover" />
                  <span className="flex-1 truncate text-sm text-gray-700 dark:text-neutral-200">{photo.name}</span>
                  <button
                    type="button"
                    onClick={removePhoto}
                    title={t("newOrderPanel.photo.remove")}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    pickPhoto(e.dataTransfer.files?.[0]);
                  }}
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 hover:bg-gray-50 dark:border-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-800"
                >
                  <ImagePlus className="h-4 w-4 shrink-0" />
                  {t("newOrderPanel.photo.add")}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      pickPhoto(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
              {photoError && <p className="text-xs text-red-600 dark:text-red-400">{photoError}</p>}
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>{t("newOrderPanel.fields.note")}</span>
            <textarea
              className={`${FIELD_CLS} h-20 resize-none py-2`}
              placeholder={t("newOrderPanel.notePlaceholder")}
              value={form.note}
              onChange={(e) => setField("note", e.target.value)}
            />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("newOrderPanel.cancel")}
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
            {t("newOrderPanel.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_STYLES = {
  new: "bg-navy-50 text-navy-700 dark:bg-navy-500/15 dark:text-navy-300",
  inProgress: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  done: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  cancelled: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

function StatusBadge({ status }) {
  const t = useTranslations("ordersCip");
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? STATUS_STYLES.new}`}>
      {t(`status.${status}`)}
    </span>
  );
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(date);
}

const HEAD_CLS = "sticky top-0 z-10 bg-gray-50 text-[11px] font-medium tracking-wide text-gray-400 dark:bg-neutral-800 dark:text-neutral-500";
const CELL_CLS = "text-gray-600 dark:text-neutral-300";

// Local-only concept table, same status as Materiały SM (see AGENTS.md's
// "Materiały SM" section) - "Zamówienia" has no backend endpoint yet, so
// this renders straight from a static seed (lib/ordersCipSeed.js) instead
// of real CIP order data. Not built on the shared MaterialsTable - that
// component's columns all read one flat row shape, and an order's own
// fields (status/line/employeeNo) share nothing with its line items'
// (itemNo/itemName/quantity), so this instead mirrors SmMaterialsPanel's
// own hand-rolled groupParent/groupChild expand pattern: a chevron toggles
// each order row open to reveal what it holds (its type-specific values and
// its ordered items) indented underneath, same tree-line treatment.
export default function OrdersCipListTable() {
  const t = useTranslations("ordersCip");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState({});
  const [ordersData, setOrdersData] = useState(ORDERS_CIP_SEED);
  const [newOrderType, setNewOrderType] = useState(null);

  function toggle(orderNo) {
    setExpanded((prev) => ({ ...prev, [orderNo]: !prev[orderNo] }));
  }

  // New order goes straight to "new"/onto the top of the list - same
  // local-only concept as the rest of this table (see its own comment),
  // no backend call.
  function handleCreateOrder({ type, from, to, details, note, photo, employeeNo, items }) {
    const orderNo = nextOrderNo(ordersData);
    const order = {
      id: orderNo,
      orderNo,
      type,
      status: "new",
      line: to ?? from,
      from,
      to,
      details,
      employeeNo,
      fulfilledBy: "-",
      createdAt: new Date().toISOString(),
      note: note || "-",
      photo,
      items,
    };
    setOrdersData((prev) => [order, ...prev]);
  }

  // Every place known so far: the fixed lines first, then whatever was typed
    // on earlier transport orders (each new place joins the list by being on an
    // order). Same list for everyone.
  const locationPool = useMemo(() => {
    const extra = new Set();
    for (const order of ordersData) {
      for (const place of [order.from, order.to]) if (place && !LINE_CODES.includes(place)) extra.add(place);
    }
    return [...LINE_CODES, ...[...extra].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))];
  }, [ordersData]);

  const orders = useMemo(() => {
    if (!search) return ordersData;
    const needle = search.toLowerCase();
    return ordersData.filter((order) =>
      [order.orderNo, t(`types.${order.type}`), routeLabel(order), order.employeeNo, order.note, t(`status.${order.status}`)].some((field) =>
        field?.toLowerCase().includes(needle)
      )
    );
  }, [ordersData, search, t]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-neutral-400">{t("count", { count: orders.length })}</p>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                {t("newOrder")}
                <ChevronDown className="h-4 w-4" />
              </Button>
            }
          />
          {/* Fixed 200px wide - room for the longest type name on one line. */}
          <DropdownMenuContent align="end" className="w-[200px] min-w-[200px]">
            {ORDER_TYPES.map(({ code, icon: Icon, iconTone }) => (
              <DropdownMenuItem key={code} onClick={() => setNewOrderType(code)} className="gap-2.5 whitespace-nowrap py-1.5">
                <Icon className={`h-4 w-4 ${iconTone}`} />
                {t(`types.${code}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <NewOrderPanel type={newOrderType} locations={locationPool} onClose={() => setNewOrderType(null)} onCreate={handleCreateOrder} t={t} />

      <div className="mt-4">
        <FrpFilters onGlobalFilterChange={setSearch} />

        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-neutral-800">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800">
                <TableHead className={`w-8 ${HEAD_CLS}`} />
                <TableHead className={`pl-0 ${HEAD_CLS}`}>{t("columns.orderNo")}</TableHead>
                <TableHead className={HEAD_CLS}>{t("columns.type")}</TableHead>
                <TableHead className={HEAD_CLS}>{t("columns.status")}</TableHead>
                <TableHead className={HEAD_CLS}>{t("columns.line")}</TableHead>
                <TableHead className={HEAD_CLS}>{t("columns.employeeNo")}</TableHead>
                <TableHead className={HEAD_CLS}>{t("columns.fulfilledBy")}</TableHead>
                <TableHead className={HEAD_CLS}>{t("columns.createdAt")}</TableHead>
                <TableHead className={`pr-4 ${HEAD_CLS}`}>{t("columns.note")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-sm text-gray-400 dark:text-neutral-500">
                    {t("emptyStatus")}
                  </TableCell>
                </TableRow>
              )}
              {orders.map((order) => {
                const details = detailLines(order, t);
                const items = order.items ?? [];
                const expandable = details.length > 0 || items.length > 0 || Boolean(order.photo);
                const isOpen = expandable && Boolean(expanded[order.orderNo]);
                return (
                  <Fragment key={order.orderNo}>
                    <TableRow onClick={expandable ? () => toggle(order.orderNo) : undefined} className={expandable ? "cursor-pointer" : undefined}>
                      <TableCell className="w-8 pl-4">
                        {expandable &&
                          (isOpen ? (
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                          ))}
                      </TableCell>
                      <TableCell className={`pl-0 font-medium ${CELL_CLS}`}>{order.orderNo}</TableCell>
                      <TableCell className={CELL_CLS}>{t(`types.${order.type}`)}</TableCell>
                      <TableCell>
                        <StatusBadge status={order.status} />
                      </TableCell>
                      <TableCell className={CELL_CLS}>{routeLabel(order)}</TableCell>
                      <TableCell className={CELL_CLS}>{order.employeeNo}</TableCell>
                      <TableCell className={CELL_CLS}>{order.fulfilledBy}</TableCell>
                      <TableCell className={CELL_CLS}>{formatDateTime(order.createdAt)}</TableCell>
                      <TableCell className={`pr-4 ${CELL_CLS}`}>{order.note}</TableCell>
                    </TableRow>
                    {isOpen && details.length > 0 && (
                      <TableRow className="bg-gray-50/60 dark:bg-neutral-900/40">
                        <TableCell className="relative w-8 pl-4">
                          <span className="absolute inset-y-0 left-6 flex w-3.5 justify-center">
                            <span className="h-full w-px bg-gray-300 dark:bg-neutral-600" />
                          </span>
                        </TableCell>
                        <TableCell colSpan={8} className={`pl-2 pr-4 ${CELL_CLS}`}>
                          {details.join(" · ")}
                        </TableCell>
                      </TableRow>
                    )}
                    {isOpen && order.photo && (
                      <TableRow className="bg-gray-50/60 dark:bg-neutral-900/40">
                        <TableCell className="relative w-8 pl-4">
                          <span className="absolute inset-y-0 left-6 flex w-3.5 justify-center">
                            <span className="h-full w-px bg-gray-300 dark:bg-neutral-600" />
                          </span>
                        </TableCell>
                        <TableCell colSpan={8} className="py-2 pl-2 pr-4">
                          <a href={order.photo.url} target="_blank" rel="noreferrer" title={order.photo.name} className="inline-block">
                            <img src={order.photo.url} alt={order.photo.name} className="h-20 rounded-md border border-gray-200 object-cover dark:border-neutral-700" />
                          </a>
                        </TableCell>
                      </TableRow>
                    )}
                    {isOpen &&
                      items.map((item) => (
                        <TableRow key={`${order.orderNo}-${item.itemNo}`} className="bg-gray-50/60 dark:bg-neutral-900/40">
                          <TableCell className="relative w-8 pl-4">
                            <span className="absolute inset-y-0 left-6 flex w-3.5 justify-center">
                              <span className="h-full w-px bg-gray-300 dark:bg-neutral-600" />
                            </span>
                          </TableCell>
                          <TableCell className={`pl-2 ${CELL_CLS}`}>{item.itemNo}</TableCell>
                          <TableCell colSpan={2} className={CELL_CLS}>
                            {item.itemName}
                          </TableCell>
                          <TableCell className={`tabular-nums ${CELL_CLS}`}>
                            {item.quantity}
                            {item.unit ? ` ${item.unit}` : ""}
                          </TableCell>
                          <TableCell colSpan={4} className={`pr-4 text-gray-400 dark:text-neutral-500`}>
                            {item.note}
                          </TableCell>
                        </TableRow>
                      ))}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
