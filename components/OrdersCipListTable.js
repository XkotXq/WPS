"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown, ChevronRight, Droplets, ImagePlus, LayoutGrid, Package, Plus, Spool, Table2, Trash2, Truck, Undo2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import FrpFilters from "@/components/FrpFilters";
import { ORDERS_CIP_SEED } from "@/lib/ordersCipSeed";
import { smCatalogApi } from "@/lib/smCatalogApi";
import { lineMaterialRulesApi } from "@/lib/lineMaterialRulesApi";
import { searchCipOrderMaterials } from "@/lib/cipOrdersApi";
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
  { code: "spool_order", fields: ["to", "items"], icon: Spool, iconTone: "text-gray-600! dark:text-neutral-300!" },
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
// order_items' own fixed unit - see addItem's own comment.
const ITEM_UNIT = "szt.";

function RequiredMark() {
  return <span className="text-red-600 dark:text-red-400"> *</span>;
}

// Next sequential order number for the current year - ZM/<year>/<4-digit
// running number> matching the seed's own format (see ordersCipSeed.js).
// Three 8-hour shifts covering the whole day, each defined by its start -
// mirrors wpsApi's orders.draft.sql (shifts table + order_shift()) exactly,
// so a real backend can take over order numbering later without the format
// changing under this demo's feet.
const SHIFTS = [
  { code: "A", startHour: 6 },
  { code: "B", startHour: 14 },
  { code: "C", startHour: 22 },
];

// now's wall-clock date/time in Europe/Warsaw, regardless of the browser's
// own timezone - Intl handles DST so this never needs a manual UTC offset.
function warsawParts(now) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Warsaw",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return { year: +parts.year, month: +parts.month, day: +parts.day, hour: +parts.hour === 24 ? 0 : +parts.hour, minute: +parts.minute };
}

// Which shift `now` falls in: its code, the calendar day it STARTED on (for
// shift C after midnight that's the day before), the hour of the shift
// (1-8, by the wall clock) and the plain minute. Same "most recent shift
// start not in the future" rule as order_shift() in orders.draft.sql - built
// on a UTC-flagged Date used purely for calendar-day math (year/month/day
// rollover), never for its own timezone, so it can't drift by an hour.
function orderShift(now) {
  const { year, month, day, hour, minute } = warsawParts(now);
  const nowMinutes = hour * 60 + minute;
  let best = null;
  for (const shift of SHIFTS) {
    let deltaMinutes = nowMinutes - shift.startHour * 60;
    const shiftDate = new Date(Date.UTC(year, month - 1, day));
    if (deltaMinutes < 0) {
      deltaMinutes += 24 * 60;
      shiftDate.setUTCDate(shiftDate.getUTCDate() - 1);
    }
    if (!best || deltaMinutes < best.deltaMinutes) best = { code: shift.code, deltaMinutes, shiftDate };
  }
  return { code: best.code, hourOfShift: Math.floor(best.deltaMinutes / 60) + 1, minute, shiftDate: best.shiftDate };
}

function yymmdd(date) {
  return `${String(date.getUTCFullYear()).slice(-2)}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

// [shift A/B/C][hour of the shift 1-8][minute 00-59]/[yymmdd of the shift's
// START day]/[3 random digits], e.g. B137/260924/482 - the random suffix is
// re-drawn until it isn't already used (this demo's own stand-in for the
// real backend's advisory-lock-serialized retry loop).
function nextOrderNo(existingOrders, now = new Date()) {
  const { code, hourOfShift, minute, shiftDate } = orderShift(now);
  const base = `${code}${hourOfShift}${String(minute).padStart(2, "0")}/${yymmdd(shiftDate)}`;
  const taken = new Set(existingOrders.map((o) => o.orderNo));
  let candidate;
  let tries = 0;
  do {
    candidate = `${base}/${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;
    tries += 1;
  } while (taken.has(candidate) && tries < 100);
  return candidate;
}

// "Skąd → dokąd" when an order has both, else the one line it concerns.
function routeLabel(order) {
  if (order.from && order.to) return `${order.from} → ${order.to}`;
  return order.line ?? order.to ?? order.from ?? "-";
}

// "Wytyczne do transportów" (line_material_rules, see LineMaterialRulesTable.js)
// for one item delivered to `lineName` - what the forklift operator sees
// against a real order's own items below, same lookup NewOrderPanel already
// runs live while the order is being placed (see its own `ruleFor`).
// Case-insensitive: `lineName` here is an order's stored `to`, already its
// canonical spelling, but comparing loosely costs nothing and avoids a
// silent miss if that ever isn't true for some order.
function ruleNoteFor(lineRules, lineName, itemNo) {
  if (!lineName) return null;
  const needle = lineName.trim().toLowerCase();
  return lineRules.find((r) => r.lineName.toLowerCase() === needle && r.itemNo === itemNo)?.note ?? null;
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
// `restrictToList`: the value must be exactly one of `locations` (case-
// insensitive) - no addition of your own, unlike Transport półproduktów's
// "skąd"/"dokąd", which is allowed to register a genuinely new place.
function LocationInput({ label, value, onChange, locations, t, restrictToList = false }) {
  const [open, setOpen] = useState(false);
  const needle = value.trim().toLowerCase();
  const matches = useMemo(
    () => locations.filter((name) => !needle || name.toLowerCase().includes(needle)).slice(0, 8),
    [locations, needle]
  );
  const isKnown = locations.some((name) => name.toLowerCase() === needle);
  const showInvalidHint = restrictToList && needle !== "" && !isKnown;

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
      {showInvalidHint && <span className="text-xs text-red-600 dark:text-red-400">{t("newOrderPanel.locationInvalid")}</span>}
    </label>
  );
}

const EMPTY_FORM = { from: "", to: "", water: "", productionOrderNo: "", note: "" };

// The full order number/orderId a set of resolved CIP orderIds (see
// cip.js's fragment resolution) actually means, for display and for
// writing back into `productionOrderNo` itself (see fetchOrderMaterials) -
// usually they all agree on one exact orderId, but a bare/fragment number
// can resolve to several production lines at once, so this falls back to
// their shared base order number (no line suffix) when they don't all
// share one. `fallback` is used only when `ids` is empty (nothing resolved
// yet/at all).
function resolvedOrderLabelFromIds(ids, fallback) {
  if (ids.length === 0) return fallback;
  if (ids.length === 1) return ids[0];
  const base = ids[0].replace(/\(\d+\)$/, "");
  return ids.every((id) => id.startsWith(base)) ? base : ids.join(", ");
}

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
  const isMaterialOrder = config.code === "material_order";
  const [form, setForm] = useState(EMPTY_FORM);
  const [catalog, setCatalog] = useState([]);
  // "Wytyczne do transportów" (line_material_rules, managed on its own wps
  // page) - a standing note for one (line, material) pair, e.g. "SH02 +
  // Glass Yarn/600tex -> krótkie odcinki". Fetched once per dialog open
  // (small reference list, same as `catalog`) and matched live below
  // against the destination line + each added item, so editing a guideline
  // takes effect on the very next order without anything else changing.
  const [lineRules, setLineRules] = useState([]);
  // "Zamówienie materiału" scopes its own material picker to what the typed
  // production order actually needs (CIP's own BOM, via wpsApi's
  // /cip-orders/:orderId/materials/warehouse - see lib/cipOrdersApi.js)
  // instead of the full sm_catalog every other "items" type searches -
  // fetched fresh whenever `productionOrderNo` settles (debounced below).
  const [orderMaterials, setOrderMaterials] = useState([]);
  const [orderMaterialsStatus, setOrderMaterialsStatus] = useState("idle"); // idle | loading | ready | error
  // The productionOrderNo value `orderMaterials` was last fetched for (or is
  // currently being fetched for) - a blur with the same value already
  // fetched (e.g. clicking into the field and back out without retyping
  // anything) is a no-op instead of re-querying CIP for a result already on
  // screen. Reset on the dialog opening fresh, same as the state it guards.
  const lastFetchedOrderNoRef = useRef(null);
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
    setOrderMaterials([]);
    setOrderMaterialsStatus("idle");
    lastFetchedOrderNoRef.current = null;
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
  // isn't worth the extra prop plumbing. "Zamówienie materiału" needs this
  // too now - typing something searches it as well, below the order's own
  // scoped matches (see the `matches`/`otherMatches` split further down) -
  // not just its own order-scoped list.
  useEffect(() => {
    if (!open || !has("items")) return;
    smCatalogApi.list().then(setCatalog).catch(() => {});
    lineMaterialRulesApi.list().then(setLineRules).catch(() => {});
  }, [open, type]);

  // The guideline (if any) for `itemNo` delivered to the form's current
  // "to" line - case-insensitive, since a typed line is canonicalized to
  // its known spelling elsewhere but this runs on every keystroke of that
  // field too, before canonicalization has necessarily happened.
  function ruleFor(itemNo) {
    const toLine = form.to.trim().toLowerCase();
    if (!toLine) return null;
    return lineRules.find((r) => r.lineName.toLowerCase() === toLine && r.itemNo === itemNo)?.note ?? null;
  }

  // Fetch of this production order's own materials, scoped to this
  // warehouse - see the `orderMaterials` state's own comment. Only runs once
  // the field is left (onBlur below), not on every keystroke - a full
  // orderId like "260010309025001(1)" is typed over several keystrokes, and
  // firing a CIP request on each one would spam it with lookups for
  // incomplete numbers. Typing again after a fetch clears the previous
  // result immediately (via the input's onChange), so a stale list is never
  // shown as if it still matched what's currently typed. Blurring back out
  // with the same value already fetched (e.g. tabbing through the field
  // without retyping anything) skips the request entirely - see
  // `lastFetchedOrderNoRef`'s own comment.
  function fetchOrderMaterials() {
    const trimmed = form.productionOrderNo.trim();
    if (!trimmed) {
      setOrderMaterials([]);
      setOrderMaterialsStatus("idle");
      lastFetchedOrderNoRef.current = null;
      return;
    }
    if (trimmed === lastFetchedOrderNoRef.current) return;
    lastFetchedOrderNoRef.current = trimmed;
    setOrderMaterialsStatus("loading");
    searchCipOrderMaterials(trimmed)
      .then((data) => {
        const lines = Array.isArray(data) ? data : [data];
        const seen = new Set();
        const items = [];
        for (const line of lines) {
          for (const m of line.materials ?? []) {
            const itemNo = String(m.itemCode ?? "").trim();
            if (!itemNo || seen.has(itemNo)) continue;
            seen.add(itemNo);
            // A typed fragment/bare number can match several production
            // lines of the same order (see cip.js's fragment resolution) -
            // `orderId` remembers which exact one this material actually
            // came from (the first line it's found on, if more than one
            // shares it), so it can be written onto the order item itself
            // once added (see addItem/handleSubmit) instead of only the
            // possibly-imprecise value the operator typed.
            items.push({
              itemNo,
              itemName: m.name || m.itemCode,
              unit: m.unit ?? "",
              orderId: line.orderId,
              // CIP's own "segment" for this line (e.g. "2.1*475") - same
              // field the "Zamówienia" search tab already shows next to an
              // order's own orderId (see OrderMaterialsSearch.js).
              segment: line.segDescription ?? null,
            });
          }
        }
        setOrderMaterials(items);
        setOrderMaterialsStatus("ready");
        // What was typed can be a fragment ("32301(3)" - see cip.js's
        // fragment resolution) - correct the field itself to the full
        // resolved number CIP actually matched (confirmed live: without
        // this, a transport order created from a fragment kept the
        // fragment, not the real number, in its own stored
        // details.productionOrderNo forever). Also updates the "already
        // fetched this" guard to the corrected value, so a blur right after
        // this doesn't treat it as a new value and re-fetch.
        const resolved = resolvedOrderLabelFromIds([...new Set(items.map((it) => it.orderId).filter(Boolean))], trimmed);
        if (resolved !== trimmed) {
          setField("productionOrderNo", resolved);
          lastFetchedOrderNoRef.current = resolved;
        }
      })
      .catch(() => {
        setOrderMaterials([]);
        setOrderMaterialsStatus("error");
        // A failure shouldn't need a retyped value to retry - just blurring
        // the field again tries once more.
        lastFetchedOrderNoRef.current = null;
      });
  }

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  // The full order number/orderId the fetched materials actually resolved
  // to - shown in the picker's group label instead of `form.productionOrderNo`
  // itself, which can be a fragment/ending ("25501(1)" - see cip.js's
  // fragment resolution) rather than the real thing. Each material already
  // carries its own resolved `orderId` (see fetchOrderMaterials); usually
  // they all agree on one, but a bare/fragment number can resolve to several
  // production lines at once, so falls back to their shared base order
  // number (no line suffix) when they don't all share one exact orderId.
  const resolvedOrderLabel = useMemo(() => {
    const ids = [...new Set(orderMaterials.map((entry) => entry.orderId).filter(Boolean))];
    return resolvedOrderLabelFromIds(ids, form.productionOrderNo.trim());
  }, [orderMaterials, form.productionOrderNo]);

  // "Zamówienie materiału" browses its (usually short) order-scoped list on
  // focus, no typing required, labeled with the order it's for (see the
  // picker's own render below) - every other "items" type keeps needing a
  // typed needle against the full sm_catalog, same as before, and never has
  // an `orderMatches` group at all.
  const orderMatches = useMemo(() => {
    if (!isMaterialOrder) return [];
    const needle = itemSearch.trim().toLowerCase();
    return orderMaterials
      .filter((entry) => !rows.some((row) => row.itemNo === entry.itemNo))
      .filter((entry) => !needle || entry.itemNo.toLowerCase().includes(needle) || entry.itemName.toLowerCase().includes(needle))
      .slice(0, 20);
  }, [orderMaterials, isMaterialOrder, itemSearch, rows]);

  // The general catalog, shown below `orderMatches` - only once something's
  // typed (unlike `orderMatches`, this is never browsable empty-handed: the
  // full sm_catalog is hundreds of rows, not a handful scoped to one order)
  // and never repeating an item already offered above.
  const otherMatches = useMemo(() => {
    const needle = itemSearch.trim().toLowerCase();
    if (!needle) return [];
    const shown = new Set([...rows.map((row) => row.itemNo), ...orderMatches.map((entry) => entry.itemNo)]);
    return catalog
      .filter((entry) => !shown.has(entry.itemNo))
      .filter((entry) => entry.itemNo.toLowerCase().includes(needle) || entry.itemName.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [catalog, itemSearch, rows, orderMatches]);

  function addItem(entry) {
    // order_items are always counted by piece, never the material's own
    // sm_catalog/CIP unit (km/kg/...) - see wpsApi's AGENTS.md, "Transport
    // orders" - a transport order asks for N pieces of something to be
    // brought over, not a weighed-out quantity.
    setRows((prev) => [
      ...prev,
      { itemNo: entry.itemNo, itemName: entry.itemName, unit: ITEM_UNIT, quantity: "", orderId: entry.orderId, segment: entry.segment },
    ]);
    setItemSearch("");
    setPickerOpen(false);
  }

  function updateQuantity(itemNo, value) {
    setRows((prev) => prev.map((row) => (row.itemNo === itemNo ? { ...row, quantity: sanitizeQuantityInput(value) } : row)));
  }

  function removeRow(itemNo) {
    setRows((prev) => prev.filter((row) => row.itemNo !== itemNo));
  }

  // A row left blank defaults to 1 (see the quantity input's own "1"
  // placeholder) rather than being dropped - typing is optional for the
  // common case of ordering a single piece.
  const validRows = rows
    .map((row) => ({ ...row, quantity: row.quantity.trim() === "" ? "1" : row.quantity }))
    .filter((row) => parseFloat(row.quantity) > 0);
  // A line-only field (every type but the free-text transport) must be
  // exactly one of the fixed line codes - no made-up addition, unlike
  // "skąd"/"dokąd" on Transport półproduktów, which is allowed to register
  // a genuinely new place.
  const isValidPlace = (value) => {
    const trimmed = value.trim();
    if (!trimmed) return false;
    return config.freeText || LINE_CODES.some((code) => code.toLowerCase() === trimmed.toLowerCase());
  };
  const canSubmit =
    (!has("to") || isValidPlace(form.to)) &&
    (!has("from") || isValidPlace(form.from)) &&
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
        ? validRows.map((row) => ({
            itemNo: row.itemNo,
            itemName: row.itemName,
            quantity: row.quantity,
            unit: row.unit,
            // The exact CIP order line this material came from (see
            // fetchOrderMaterials) - written onto the item itself since the
            // typed productionOrderNo above can be a fragment/bare number
            // matching several lines, so it alone wouldn't say which one
            // this particular material was actually pulled from.
            note: row.orderId ?? "-",
          }))
        : [],
    });
    setPhoto(null); // now owned by the order
    onClose();
  }

  // "Skąd" and "dokąd" together sit in one row - [skąd] -> [dokąd].
  const inRow = has("from") && has("to");
  // Same input-with-suggestions everywhere a place is picked - only the
  // suggestion pool differs: the fixed line codes for an ordinary type, the
  // full (fixed lines + every place typed on an earlier transport order)
  // pool for the free-text type.
  const locationField = (field, label) => (
    <LocationInput
      label={label}
      value={form[field]}
      onChange={(value) => setField(field, value)}
      locations={config.freeText ? locations : LINE_CODES}
      restrictToList={!config.freeText}
      t={t}
    />
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {/* "Zamówienie materiału" gets a wider dialog (max-w-lg's own 32rem *
          1.5 = 48rem = max-w-3xl) - its own material picker (two labeled
          groups, see orderMatches/otherMatches above) needs more room than
          every other order type's plain form. */}
      <DialogContent className={isMaterialOrder ? "max-w-3xl" : undefined}>
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
              <input
                className={FIELD_CLS}
                value={form.productionOrderNo}
                onChange={(e) => {
                  setField("productionOrderNo", e.target.value);
                  // The list on screen is for whatever was last fetched - once the
                  // value changes it no longer matches, so drop it rather than let
                  // it sit there looking current until the next blur re-fetches.
                  if (orderMaterialsStatus !== "idle") {
                    setOrderMaterials([]);
                    setOrderMaterialsStatus("idle");
                  }
                }}
                onBlur={() => isMaterialOrder && fetchOrderMaterials()}
              />
              {isMaterialOrder && orderMaterialsStatus === "loading" && (
                <span className="text-xs text-gray-400 dark:text-neutral-500">{t("newOrderPanel.orderMaterialsLoading")}</span>
              )}
              {isMaterialOrder && orderMaterialsStatus === "error" && (
                <span className="text-xs text-red-600 dark:text-red-400">{t("newOrderPanel.orderMaterialsError")}</span>
              )}
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
                disabled={isMaterialOrder && !form.productionOrderNo.trim()}
                onChange={(e) => {
                  setItemSearch(e.target.value);
                  setPickerOpen(true);
                }}
                onFocus={() => setPickerOpen(true)}
                onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
                placeholder={
                  isMaterialOrder && !form.productionOrderNo.trim()
                    ? t("newOrderPanel.addItemPlaceholderNeedOrderNo")
                    : t("newOrderPanel.addItemPlaceholder")
                }
              />
              {pickerOpen && (itemSearch.trim() || isMaterialOrder) && !(isMaterialOrder && !form.productionOrderNo.trim()) && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                  {isMaterialOrder && orderMaterialsStatus === "loading" ? (
                    <p className="px-3 py-2 text-sm text-gray-400 dark:text-neutral-500">{t("newOrderPanel.orderMaterialsLoading")}</p>
                  ) : isMaterialOrder && orderMaterialsStatus === "error" ? (
                    <p className="px-3 py-2 text-sm text-red-600 dark:text-red-400">{t("newOrderPanel.orderMaterialsError")}</p>
                  ) : orderMatches.length === 0 && otherMatches.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-gray-400 dark:text-neutral-500">{t("newOrderPanel.noMatches")}</p>
                  ) : (
                    <>
                      {isMaterialOrder && orderMatches.length > 0 && (
                        <>
                          <p className="truncate bg-navy-50 px-3 py-1.5 text-xs font-semibold text-navy-700 dark:bg-navy-500/15 dark:text-navy-300">
                            {t("newOrderPanel.orderMaterialsLabel", { orderNo: resolvedOrderLabel })}
                          </p>
                          {orderMatches.map((entry) => (
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
                            </button>
                          ))}
                        </>
                      )}
                      {otherMatches.length > 0 && (
                        <>
                          {isMaterialOrder && (
                            <p className="truncate bg-gray-50 px-3 py-1 text-[11px] font-medium text-gray-400 dark:bg-neutral-800 dark:text-neutral-500">
                              {t("newOrderPanel.otherMaterialsLabel")}
                            </p>
                          )}
                          {otherMatches.map((entry) => (
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
                            </button>
                          ))}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </label>
          )}

          {has("items") && rows.length > 0 && (
            <div className="flex max-h-44 flex-col gap-1 overflow-y-auto">
              {rows.map((row) => (
                <div key={row.itemNo} className="flex items-center gap-2 rounded-lg bg-gray-50 dark:bg-neutral-800/50 px-3 py-1.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate">
                      <span className="font-medium text-gray-900 dark:text-neutral-100">{row.itemName}</span>
                      <span className="ml-1.5 text-gray-400 dark:text-neutral-500">{row.itemNo}</span>
                    </div>
                    {/* Its own line, never truncated - it's the whole point
                        of showing it (see fetchOrderMaterials' own comment),
                        so it must never get cut off by a long item name
                        sharing one truncated line with it. The segment
                        (CIP's own "segment" for this line, e.g. "2.1*475" -
                        same field OrderMaterialsSearch.js already shows next
                        to an order's own orderId) sits on the opposite side
                        of that same line. */}
                    {row.orderId && (
                      <div className="flex items-center justify-between gap-2 text-xs text-gray-400 dark:text-neutral-500">
                        <span className="truncate">{row.orderId}</span>
                        {row.segment && <span className="shrink-0">{row.segment}</span>}
                      </div>
                    )}
                    {/* "Wytyczne do transportów" for this exact material on
                        the "Dokąd" line above - see ruleFor's own comment.
                        Recomputed on every render, so retyping the
                        destination line updates it immediately. */}
                    {ruleFor(row.itemNo) && (
                      <p className="mt-0.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                        {ruleFor(row.itemNo)}
                      </p>
                    )}
                  </div>
                  <input
                    className="h-8 w-24 rounded-md border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 text-right text-sm tabular-nums text-gray-900 dark:text-neutral-100 focus:border-navy-700 dark:focus:border-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400"
                    inputMode="decimal"
                    autoFocus
                    placeholder="1"
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
  const t = useTranslations("ordersTransport");
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

// "Karty" view: everything type-specific (detailLines, items, photo) sits
// right on the card instead of behind a chevron - the point of this view is
// seeing e.g. "Dolewanie wody" + "Rodzaj wody: Czysta" at a glance, not
// having to open each order to find out.
function OrderCard({ order, t, lineRules }) {
  const config = ORDER_TYPES.find((entry) => entry.code === order.type);
  const Icon = config?.icon;
  const details = detailLines(order, t);
  const items = order.items ?? [];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className={`h-4 w-4 shrink-0 ${config.iconTone}`} />}
          <span className="truncate text-sm font-semibold text-gray-900 dark:text-neutral-100">{t(`types.${order.type}`)}</span>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div>
        <p className="font-medium text-gray-900 dark:text-neutral-100">{order.orderNo}</p>
        <p className="text-sm text-gray-500 dark:text-neutral-400">{routeLabel(order)}</p>
      </div>

      {details.length > 0 && (
        <ul className="space-y-0.5 text-sm text-gray-700 dark:text-neutral-200">
          {details.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <ul className="space-y-1.5 border-t border-gray-100 dark:border-neutral-800 pt-2 text-sm text-gray-700 dark:text-neutral-200">
          {items.map((item) => {
            const guideline = ruleNoteFor(lineRules, order.to, item.itemNo);
            return (
              <li key={item.itemNo}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {item.itemName} <span className="text-gray-400 dark:text-neutral-500">{item.itemNo}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {item.quantity}
                    {item.unit ? ` ${item.unit}` : ""}
                  </span>
                </div>
                {/* The transport guideline for this exact (line, material) -
                    what the forklift operator needs to know, e.g. "krótkie
                    odcinki" - see ruleNoteFor's own comment. */}
                {guideline && (
                  <p className="mt-0.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                    {guideline}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {order.photo && (
        <a href={order.photo.url} target="_blank" rel="noreferrer" title={order.photo.name}>
          <img
            src={order.photo.url}
            alt={order.photo.name}
            className="h-28 w-full rounded-md border border-gray-200 object-cover dark:border-neutral-700"
          />
        </a>
      )}

      {order.note && order.note !== "-" && <p className="text-sm text-gray-500 dark:text-neutral-400">{order.note}</p>}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-gray-100 dark:border-neutral-800 pt-2 text-xs text-gray-400 dark:text-neutral-500">
        <span>
          {t("columns.employeeNo")}: {order.employeeNo || "-"}
        </span>
        {order.fulfilledBy && order.fulfilledBy !== "-" && (
          <span>
            {t("columns.fulfilledBy")}: {order.fulfilledBy}
          </span>
        )}
        <span>{formatDateTime(order.createdAt)}</span>
      </div>
    </div>
  );
}

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
// Lista zamówień = still open (new/in_progress) - the working queue;
// Historia zamówień = closed (done/cancelled) - the archive. A closed order
// leaves the queue the moment it's marked done/cancelled, no grace period -
// see AGENTS.md's "Zamówienia" section for the reasoning.
const STATUS_SETS = { active: ["new", "inProgress"], history: ["done", "cancelled"] };

export default function OrdersCipListTable({ mode = "active" }) {
  const t = useTranslations("ordersTransport");
  const statusSet = STATUS_SETS[mode];
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState({});
  const [ordersData, setOrdersData] = useState(ORDERS_CIP_SEED);
  const [newOrderType, setNewOrderType] = useState(null);
  const [viewMode, setViewMode] = useState("table");
  // "Wytyczne do transportów" - fetched once here (not per order row) and
  // matched live per item below (see ruleNoteFor) so an edited/added
  // guideline shows up on every matching order immediately, without a
  // reload - same live-lookup idea as the still-draft order_items_with_notes
  // view (see wpsApi's AGENTS.md).
  const [lineRules, setLineRules] = useState([]);

  useEffect(() => {
    lineMaterialRulesApi.list().then(setLineRules).catch(() => {});
  }, []);

  function toggle(orderNo) {
    setExpanded((prev) => ({ ...prev, [orderNo]: !prev[orderNo] }));
  }

  // New order goes straight to "new"/onto the top of the list - same
  // local-only concept as the rest of this table (see its own comment),
  // no backend call.
  function handleCreateOrder({ type, from, to, details, note, photo, employeeNo, items }) {
    const now = new Date();
    const orderNo = nextOrderNo(ordersData, now);
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
      createdAt: now.toISOString(),
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
    const inMode = ordersData.filter((order) => statusSet.includes(order.status));
    if (!search) return inMode;
    const needle = search.toLowerCase();
    return inMode.filter((order) =>
      [order.orderNo, t(`types.${order.type}`), routeLabel(order), order.employeeNo, order.note, t(`status.${order.status}`)].some((field) =>
        field?.toLowerCase().includes(needle)
      )
    );
  }, [ordersData, search, statusSet, t]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-neutral-400">{t("count", { count: orders.length })}</p>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-100 dark:bg-neutral-800 p-1">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              title={t("viewMode.table")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === "table"
                  ? "bg-white text-navy-950 shadow-sm dark:bg-neutral-900 dark:text-white"
                  : "text-gray-500 hover:text-gray-800 dark:text-neutral-400 dark:hover:text-neutral-200"
              }`}
            >
              <Table2 className="h-4 w-4" />
              {t("viewMode.table")}
            </button>
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              title={t("viewMode.cards")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === "cards"
                  ? "bg-white text-navy-950 shadow-sm dark:bg-neutral-900 dark:text-white"
                  : "text-gray-500 hover:text-gray-800 dark:text-neutral-400 dark:hover:text-neutral-200"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              {t("viewMode.cards")}
            </button>
          </div>
        {mode === "active" && (
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
        )}
        </div>
      </div>

      {/* Creating a new order only makes sense from the active queue, not the archive. */}
      {mode === "active" && (
        <NewOrderPanel type={newOrderType} locations={locationPool} onClose={() => setNewOrderType(null)} onCreate={handleCreateOrder} t={t} />
      )}

      <div className="mt-4">
        <FrpFilters onGlobalFilterChange={setSearch} />

        {viewMode === "cards" ? (
          orders.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 dark:border-neutral-800 py-8 text-center text-sm text-gray-400 dark:text-neutral-500">
              {t("emptyStatus")}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {orders.map((order) => (
                <OrderCard key={order.orderNo} order={order} t={t} lineRules={lineRules} />
              ))}
            </div>
          )
        ) : (
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
                            {/* The transport guideline for this exact (line,
                                material) - what the forklift operator needs
                                to know, e.g. "krótkie odcinki" - see
                                ruleNoteFor's own comment. */}
                            {ruleNoteFor(lineRules, order.to, item.itemNo) && (
                              <p className="mt-0.5 inline-block rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                                {ruleNoteFor(lineRules, order.to, item.itemNo)}
                              </p>
                            )}
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
        )}
      </div>
    </div>
  );
}
