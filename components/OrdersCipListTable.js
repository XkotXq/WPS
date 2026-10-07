"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ArrowRight, ChevronDown, ChevronRight, Droplets, Forklift, ImagePlus, LayoutGrid, Package, Plus, Spool, Table2, Trash2, Truck, Undo2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import FrpFilters from "@/components/FrpFilters";
import { useListKeyboard, listRowClasses } from "@/lib/useListKeyboard";
import { ordersApi } from "@/lib/ordersApi";
import { smCatalogApi } from "@/lib/smCatalogApi";
import { lineMaterialRulesApi } from "@/lib/lineMaterialRulesApi";
import { searchCipOrderMaterials } from "@/lib/cipOrdersApi";
import { getCipSession } from "@/lib/cipSession";
import { sanitizeQuantityInput } from "@/lib/quantityInput";

// The plant's real line codes - SH01-07, ST01-13, FC01-03, FL01, not a
// made-up "Linia 1/2/3/4" - same series schema.sql's `locations` seeds.
// Used as a fallback before ordersApi.locations() resolves (see
// `locationPool`'s own initial state) and as the fixed picker for every
// order type but the free-text goods_transport.
// Spelled out since 2026-10-06: the series stopped being regular ranges.
// Kept in step with wpsApi's own seed (schema.sql) and smOrder's
// line_codes.dart by hand - three copies of one list, which is why adding a
// line means touching all three. Reading them from GET
// /line-material-rules/lines instead is the obvious next step.
const LINE_CODES = [
  "SH01", "SH02", "SH03", "SH04", "SH05", "SH06", "SH07", "SH08",
  "SH09", "SH10", "SH11", "SH12", "SH13", "FC01", "FC02", "FC03",
  "FC04", "FC05", "FC06", "FC07", "FC08", "FL01", "WS01", "SC01",
  "SC02", "SC03", "SC04", "SC05", "SC06", "SC07", "SC08", "TF01",
  "TF02", "TF03", "SU01", "SU02", "SU03", "SU04", "SU05", "SU06",
  "SU07", "SU08", "ST01", "ST02", "ST03", "ST04", "ST05", "ST06",
  "ST07",
];

// What each type of order asks for - the "Nowe zamówienie" menu lists these in
// this order. `from`/`to` are line codes (the only places there are), `water`
// is the clean/dirty choice, `photo` one optional picture picked from the computer,
// `productionOrderNo` the one production order the
// whole order is filled under, `items` a list of catalog materials with a
// quantity. Mirrors wpsApi's src/schema.sql (see its AGENTS.md); the
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
  {
    code: "material_order",
    fields: ["to", "productionOrderNo", "items"],
    productionOrderNoRequired: true,
    icon: Package,
    iconTone: "text-pink-600! dark:text-pink-400!",
  },
  // The production order number finds the drum(s) that order's cable ships
  // on. Unlike material_order it is **not required** (see
  // productionOrderNoRequired): it only scopes the picker, and a spool can
  // still be named from the catalog as this type always allowed.
  {
    code: "spool_order",
    fields: ["to", "productionOrderNo", "items"],
    icon: Spool,
    iconTone: "text-gray-600! dark:text-neutral-300!",
  },
  { code: "goods_transport", fields: ["from", "to", "photo"], freeText: true, icon: Truck, iconTone: "text-orange-600! dark:text-orange-400!" },
  { code: "waste_removal", fields: ["from", "photo"], icon: Trash2, iconTone: "text-yellow-600! dark:text-yellow-400!" },
  { code: "warehouse_return", fields: ["from", "photo"], icon: Undo2, iconTone: "text-green-600! dark:text-green-400!" },
  // Free text like goods_transport: a machine goes to a workshop, a hall or
  // a gate as readily as to a line. The server decides which types may do
  // that (schema.sql's orders_before_insert) - this flag only has to agree
  // with it, or the form would offer a text box for places the insert then
  // rejects.
  {
    code: "machine_transport",
    fields: ["from", "to", "photo"],
    freeText: true,
    icon: Forklift,
    iconTone: "text-gray-600! dark:text-neutral-300!",
  },
];

// `freeText`: "skąd"/"dokąd" are not limited to the production lines - they
// suggest every place known so far (the fixed lines plus any typed on an earlier
// order) and accept a new one, which then joins the suggestions.
// The "from" line is asked differently per type.
const FROM_LABEL_KEY = { goods_transport: "from", machine_transport: "from", waste_removal: "place", warehouse_return: "collectFrom" };

const FIELD_CLS =
  "h-10 w-full rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-neutral-100 focus:border-navy-700 dark:focus:border-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400";
const LABEL_CLS = "text-xs font-medium text-gray-500 dark:text-neutral-400";
// order_items' own fixed unit - see addItem's own comment.
const ITEM_UNIT = "szt.";

// A photo attached to an order (uploaded from smOrder - see wpsApi's
// "Photos"): a thumbnail that opens the full picture in a dialog on this
// page. It used to be a plain link that threw you into a new browser tab
// showing the raw file, which loses the order you were looking at.
//
// `photo.url` is a short-lived presigned link wpsApi re-issues on every
// read, so this never caches or stores it - the dialog shows whatever the
// current render was given. "Otwórz oryginał" is kept for the cases a
// dialog cannot serve: saving the file, or zooming further in the browser's
// own viewer.
function PhotoThumbnail({ photo, className, t }) {
  const [open, setOpen] = useState(false);
  if (!photo?.url) return null;
  return (
    <>
      <button
        type="button"
        title={photo.name}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="inline-block cursor-zoom-in rounded-md transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-700 dark:focus-visible:ring-navy-400"
      >
        <img src={photo.url} alt={photo.name} className={className} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{photo.name}</DialogTitle>
          </DialogHeader>
          {/* Capped by viewport height, not a fixed size: a phone photo is
              portrait and would otherwise run off the bottom of the dialog. */}
          <img
            src={photo.url}
            alt={photo.name}
            className="max-h-[70vh] w-full rounded-md object-contain"
          />
          <DialogFooter>
            <a
              href={photo.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-navy-700 hover:underline dark:text-navy-300"
            >
              {t("photoOpenOriginal")}
            </a>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RequiredMark() {
  return <span className="text-red-600 dark:text-red-400"> *</span>;
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
// Whether anything's actually been issued against this item yet - FRP
// checks its own per-drum entries (issuedQuantity there is just a count,
// see wpsApi's order_items_progress), everything else the plain sum.
// Anything issued at all against this line - which is also what counts as
// "done" since 2026-10-02 (see wpsapi's order_items_progress.issue_count:
// the old issued >= ordered compared a piece count with a weight).
function hasIssued(item) {
  if (item.category === "FRP") return Boolean(item.issuedEntries?.length);
  return Number(item.issueCount ?? 0) > 0;
}

// "48.400" -> "48.4", "50.000" -> "50" - a quantity shown on screen without
// trailing zeros. Mirrors smpda's own trimQuantity (lib/core/utils/quantity.dart).
function trimQuantity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  let text = n % 1 === 0 ? String(n) : n.toFixed(3);
  if (text.includes(".")) text = text.replace(/0+$/, "").replace(/\.$/, "");
  return text;
}

// The "Wydano: ..." value - two formats, both ending in the ordered piece
// count (order_items.quantity, always ITEM_UNIT - see that constant's own
// comment) so this one line replaces the separate ordered-quantity display
// entirely:
// - FRP: one segment per drum actually scanned - "SZP-1(2.3km) +
//   SZP-2(4.85km)" (each entry's own unitId + quantity, catalogUnit
//   lowercased) - a plain issued/ordered count would only ever say
//   "2 szt." (how many drums), never which ones or how much cable is on
//   each.
// - everything else: "{issuedQuantity} {issuedUnit}/{quantity} szt." - the
//   real amount issued so far, over how many pieces the order itself
//   asked for, e.g. "7.5 kg/10 szt.".
function issuedLineValue(item) {
  if (item.category === "FRP" && item.issuedEntries?.length) {
    const unit = (item.catalogUnit || "").toLowerCase();
    const segments = item.issuedEntries.map((entry) => `${entry.unitId ?? "?"}(${trimQuantity(entry.quantity)}${unit})`);
    return `${segments.join(" + ")}/${item.quantity} ${ITEM_UNIT}`;
  }
  return `${trimQuantity(item.issuedQuantity)} ${item.issuedUnit ?? ""}`.trim() + `/${item.quantity} ${ITEM_UNIT}`;
}

// Type-specific values worth showing under an expanded order. The
// productionOrderNo line is pulled out separately (not pushed into `lines`)
// because OrderStageTimeline belongs right next to it, not next to
// order.orderNo - see productionOrderNoLine below and its two call sites.
function detailLines(order, t) {
  const lines = [];
  if (order.details?.water) lines.push(`${t("details.water")}: ${t(order.details.water === "clean" ? "details.clean" : "details.dirty")}`);
  return lines;
}

function productionOrderNoLine(order, t) {
  if (!order.details?.productionOrderNo) return null;
  return `${t("details.productionOrderNo")}: ${order.details.productionOrderNo}`;
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
  const pick = useCallback(
    (i) => {
      const name = matches[i];
      if (!name) return;
      onChange(name);
      setOpen(false);
    },
    [matches, onChange]
  );
  const keys = useListKeyboard({ length: matches.length, onPick: pick, onEscape: () => setOpen(false) });
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
        onKeyDown={keys.onKeyDown}
      />
      {open && needle !== "" && matches.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          {matches.map((name, i) => (
            <button
              key={name}
              ref={(el) => keys.registerRow(i, el)}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(i)}
              onMouseEnter={() => keys.setIndex(i)}
              className={`flex w-full items-center px-3 py-2 text-left text-sm text-gray-900 dark:text-neutral-100 ${listRowClasses(
                i === keys.index
              )}`}
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
  const isSpoolOrder = config.code === "spool_order";
  // Both types are scoped by a production order; they want opposite halves
  // of what CIP returns for it. A drum is not a material the line is asking
  // to be brought as stock, and a material is not a spool to wind onto -
  // wpsApi flags the drums as `isDrumRequirement` (see its AGENTS.md,
  // "Drum/spool size").
  const scopedByOrder = isMaterialOrder || isSpoolOrder;
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
              // A drum/spool this order's cable ships on, rather than a
              // material it is made of (wpsApi flags these - see its
              // AGENTS.md, "Drum/spool size"). "Zamówienie szpul" offers
              // exactly these and "Zamówienie materiału" the rest, so
              // dropping the flag here - which this mapping did at first -
              // silently showed each type the other's half.
              isDrumRequirement: Boolean(m.isDrumRequirement),
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
    if (!scopedByOrder) return [];
    const needle = itemSearch.trim().toLowerCase();
    return orderMaterials
      // **Only "Zamówienie szpul" narrows this.** It exists to order the
      // reel the cable ships on, so a BOM material would be noise there.
      // "Zamówienie materiału" keeps the whole list, drums included, the
      // way it always did: the drum is part of what that production order
      // needs, and filtering it out (which this did between 2026-10-05 and
      // 2026-10-06) took away a spool people were ordering from here - it
      // stayed visible in "Wyszukaj zamówienia", which is how the two
      // screens ended up disagreeing about the same order.
      .filter((entry) => !isSpoolOrder || Boolean(entry.isDrumRequirement))
      .filter((entry) => !rows.some((row) => row.itemNo === entry.itemNo))
      .filter((entry) => !needle || entry.itemNo.toLowerCase().includes(needle) || entry.itemName.toLowerCase().includes(needle))
      .slice(0, 20);
  }, [orderMaterials, scopedByOrder, isSpoolOrder, itemSearch, rows]);

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

  // Both groups walked as one top-to-bottom sequence - "on this order"
  // first, then everything else, exactly as they are rendered.
  const pickerFlat = scopedByOrder ? [...orderMatches, ...otherMatches] : otherMatches;
  const pickItem = useCallback(
    (i) => {
      const entry = pickerFlat[i];
      if (entry) addItem(entry);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pickerFlat]
  );
  const itemKeys = useListKeyboard({
    length: pickerFlat.length,
    onPick: pickItem,
    onEscape: () => setPickerOpen(false),
  });

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
    (!config.productionOrderNoRequired || Boolean(form.productionOrderNo.trim())) &&
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
      <DialogContent className={scopedByOrder ? "max-w-3xl" : undefined}>
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
                onBlur={() => scopedByOrder && fetchOrderMaterials()}
              />
              {scopedByOrder && orderMaterialsStatus === "loading" && (
                <span className="text-xs text-gray-400 dark:text-neutral-500">{t("newOrderPanel.orderMaterialsLoading")}</span>
              )}
              {scopedByOrder && orderMaterialsStatus === "error" && (
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
                disabled={config.productionOrderNoRequired && !form.productionOrderNo.trim()}
                onChange={(e) => {
                  setItemSearch(e.target.value);
                  setPickerOpen(true);
                }}
                onFocus={() => setPickerOpen(true)}
                onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
                onKeyDown={itemKeys.onKeyDown}
                placeholder={
                  config.productionOrderNoRequired && !form.productionOrderNo.trim()
                    ? t("newOrderPanel.addItemPlaceholderNeedOrderNo")
                    : t("newOrderPanel.addItemPlaceholder")
                }
              />
              {pickerOpen &&
                (itemSearch.trim() || (scopedByOrder && orderMatches.length > 0)) &&
                !(config.productionOrderNoRequired && !form.productionOrderNo.trim()) && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                  {scopedByOrder && orderMaterialsStatus === "loading" ? (
                    <p className="px-3 py-2 text-sm text-gray-400 dark:text-neutral-500">{t("newOrderPanel.orderMaterialsLoading")}</p>
                  ) : scopedByOrder && orderMaterialsStatus === "error" ? (
                    <p className="px-3 py-2 text-sm text-red-600 dark:text-red-400">{t("newOrderPanel.orderMaterialsError")}</p>
                  ) : orderMatches.length === 0 && otherMatches.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-gray-400 dark:text-neutral-500">{t("newOrderPanel.noMatches")}</p>
                  ) : (
                    <>
                      {scopedByOrder && orderMatches.length > 0 && (
                        <>
                          <p className="truncate bg-navy-50 px-3 py-1.5 text-xs font-semibold text-navy-700 dark:bg-navy-500/15 dark:text-navy-300">
                            {t(isSpoolOrder ? "newOrderPanel.orderSpoolsLabel" : "newOrderPanel.orderMaterialsLabel", {
                              orderNo: resolvedOrderLabel,
                            })}
                          </p>
                          {orderMatches.map((entry, i) => (
                            <button
                              key={entry.itemNo}
                              ref={(el) => itemKeys.registerRow(i, el)}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => addItem(entry)}
                              onMouseEnter={() => itemKeys.setIndex(i)}
                              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${listRowClasses(
                                i === itemKeys.index
                              )}`}
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
                          {scopedByOrder && (
                            <p className="truncate bg-gray-50 px-3 py-1 text-[11px] font-medium text-gray-400 dark:bg-neutral-800 dark:text-neutral-500">
                              {t("newOrderPanel.otherMaterialsLabel")}
                            </p>
                          )}
                          {otherMatches.map((entry, i) => (
                            <button
                              key={entry.itemNo}
                              ref={(el) => itemKeys.registerRow((scopedByOrder ? orderMatches.length : 0) + i, el)}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => addItem(entry)}
                              // Offset by the group above it, so the arrows
                              // see one list.
                              onMouseEnter={() => itemKeys.setIndex((scopedByOrder ? orderMatches.length : 0) + i)}
                              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${listRowClasses(
                                (scopedByOrder ? orderMatches.length : 0) + i === itemKeys.index
                              )}`}
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
  // "Problem" - the forklift operator can't finish it and is waiting on the
  // requester (wpsapi's reportOrderProblem). Red, like "anulowane", because
  // it reads as trouble at a glance - but it is **not** a closed order: it
  // goes back to "w realizacji" the moment somebody resolves it.
  problem: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  // "Dostarczone" (smVendor, wpsapi's orders.js) - the working part is
  // done but the requester hasn't accepted/reported a problem yet (or the
  // 10-minute auto-accept hasn't run - see AGENTS.md roadmap). Its own
  // colour, between "w realizacji" (amber) and "zrealizowane" (emerald).
  delivered: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400",
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

// The order's own lifecycle, in order - "delivered" only appears for an
// order that actually passed through it (material_order's own
// "Dostarczone", see wpsApi's deliverOrder - most other types never do).
// Each stage's `at` is its own timestamp field straight off the order (null
// = not reached yet). A stage can be skipped entirely (e.g. new ->
// cancelled direct, no in_progress) - OrderStageTimeline below draws that
// correctly (a hollow, skipped circle) since each circle's own fill only
// ever depends on its own `at`, never "everything before the current one".
function orderStages(order, t) {
  const stages = [
    { key: "new", label: t("status.new"), at: order.createdAt },
    { key: "inProgress", label: t("status.inProgress"), at: order.takenAt },
  ];
  // A blocked order gets its own stage rather than sitting on
  // "w realizacji" with nothing to say it is stuck - the most common
  // question about such a row is why it hasn't moved. Only while it *is*
  // blocked: once resolved it is in_progress again, and the one-line
  // summary is about where the order is now (the full account, every
  // problem episode included, is OrderEventLog's job).
  if (order.status === "problem") {
    stages.push({ key: "problem", label: t("status.problem"), at: order.problemReportedAt });
  }
  if (order.deliveredAt) {
    stages.push({ key: "delivered", label: t("status.delivered"), at: order.deliveredAt });
  }
  if (order.status === "cancelled") {
    stages.push({ key: "cancelled", label: t("status.cancelled"), at: order.cancelledAt });
  } else {
    stages.push({ key: "done", label: t("status.done"), at: order.completedAt });
  }
  return stages;
}

// "nazwa etapu i kreska" - minimized to fit right in the same row as
// order.orderNo itself: every stage's bare name, dash-separated, the
// current one bold/coloured and the rest muted. No circles, no per-stage
// timestamp (that got too wide for one row) - the current stage's own
// "since when" is shown separately, next to it, not per stage here.
// Every step an order actually went through, oldest first - wpsapi's own
// order_events (see ordersApi.events). Unlike OrderStageTimeline above,
// which compresses the *current* position into one line, this is the full
// account including the steps that repeat: a transport blocked twice has
// two "Zgłoszono problem" entries here and nowhere else, because the order
// row only ever holds the latest one.
//
// "in_progress" means two different things depending on what precedes it -
// work starting, or work resuming after a problem - and an event row can't
// tell them apart on its own. The sequence can, so the label is decided
// from the previous entry.
function eventLabel(event, previous, t) {
  switch (event.kind) {
    case "created":
      return t("timeline.created");
    case "inProgress":
      return previous?.kind === "problem" ? t("timeline.resumed") : t("timeline.taken");
    case "problem":
      return t("timeline.problem");
    case "delivered":
      return t("timeline.delivered");
    // "auto" is wpsapi's own actor for the 10-minute sweep closing an order
    // nobody answered. Worth saying out loud: "nobody confirmed this" and
    // "the requester confirmed this" are not the same fact afterwards.
    case "done":
      return event.actor === "auto" ? t("timeline.doneAuto") : t("timeline.done");
    case "cancelled":
      return t("timeline.cancelled");
    default:
      return event.kind;
  }
}

// Collapsed by default - most of the time an order is opened to see what is
// on it, not to audit it, and the log is the longest thing in the expanded
// row. The heading still carries the number of steps, which is the part
// worth seeing without opening anything: an ordinary transport has four,
// so anything more says something happened.
function OrderEventLog({ events, t }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className="flex w-fit items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-neutral-400 dark:hover:text-neutral-200"
      >
        {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        {t("timeline.title")}
        <span className="font-normal text-gray-400 dark:text-neutral-500">{events.length}</span>
      </button>
      {open &&
        events.map((event, i) => {
          const bad = event.kind === "problem" || event.kind === "cancelled";
          return (
            <div key={`${event.at}-${event.kind}-${i}`} className="flex items-baseline gap-2 text-xs">
              <span className="shrink-0 tabular-nums text-gray-400 dark:text-neutral-500">{formatDateTime(event.at)}</span>
              <span className={bad ? "font-medium text-red-700 dark:text-red-400" : "font-medium text-gray-700 dark:text-neutral-200"}>
                {eventLabel(event, events[i - 1], t)}
              </span>
              {event.actor && event.actor !== "auto" && (
                <span className="text-gray-400 dark:text-neutral-500">{event.actor}</span>
              )}
              {event.note && <span className="text-gray-500 dark:text-neutral-400">{event.note}</span>}
            </div>
          );
        })}
    </div>
  );
}

function OrderStageTimeline({ order, t }) {
  const stages = orderStages(order, t);
  let currentIndex = 0;
  stages.forEach((s, i) => {
    if (s.at) currentIndex = i;
  });

  return (
    <span className="whitespace-nowrap text-xs">
      {stages.map((stage, i) => (
        <Fragment key={stage.key}>
          {i > 0 && <span className="mx-1 text-gray-300 dark:text-neutral-600">–</span>}
          <span
            className={
              i === currentIndex
                ? "font-semibold text-navy-700 dark:text-navy-300"
                : stage.at
                  ? "text-gray-500 dark:text-neutral-400"
                  : "text-gray-300 dark:text-neutral-600"
            }
          >
            {stage.label}
          </span>
        </Fragment>
      ))}
      {stages[currentIndex].at && (
        <span className="ml-1.5 text-gray-400 dark:text-neutral-500">({formatDateTime(stages[currentIndex].at)})</span>
      )}
    </span>
  );
}

const HEAD_CLS = "sticky top-0 z-10 bg-gray-50 text-[11px] font-medium tracking-wide text-gray-400 dark:bg-neutral-800 dark:text-neutral-500";
const CELL_CLS = "text-gray-600 dark:text-neutral-300";

// "Karty" view: everything type-specific (detailLines, items, photo) sits
// right on the card instead of behind a chevron - the point of this view is
// seeing e.g. "Dolewanie wody" + "Rodzaj wody: Czysta" at a glance, not
// having to open each order to find out.
function OrderCard({ order, t, mode, onTake, onComplete, onCancel, onAccept, onReportProblem, onResolveProblem }) {
  const config = ORDER_TYPES.find((entry) => entry.code === order.type);
  const Icon = config?.icon;
  const details = detailLines(order, t);
  const productionLine = productionOrderNoLine(order, t);
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

      {/* A guideline saved for this line with no material - it is about the
          drive itself, so it sits on the order rather than being repeated
          under every item (see wpsApi's lineRuleNote). */}
      {order.lineRuleNote && (
        <p className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
          {order.lineRuleNote}
        </p>
      )}

      {(details.length > 0 || productionLine) && (
        <ul className="space-y-0.5 text-sm text-gray-700 dark:text-neutral-200">
          {productionLine && (
            <li className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span>{productionLine}</span>
              <OrderStageTimeline order={order} t={t} />
            </li>
          )}
          {details.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <ul className="space-y-1.5 border-t border-gray-100 dark:border-neutral-800 pt-2 text-sm text-gray-700 dark:text-neutral-200">
          {items.map((item) => {
            const guideline = item.ruleNote;
            return (
              <li key={item.itemNo}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {item.itemName} <span className="text-gray-400 dark:text-neutral-500">{item.itemNo}</span>
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    {/* "Wydano: ..." - FRP shows one segment per drum
                        actually scanned, everything else a plain
                        issued/ordered fraction - see issuedLineValue's own
                        comment. Already ends in "/{ordered} szt.", so this
                        is the only quantity shown once something's issued -
                        no separate ordered-quantity line above it. */}
                    {hasIssued(item) && <span className="block">{t("itemIssued", { value: issuedLineValue(item) })}</span>}
                    {/* Every distinct batch the issuing scan(s) carried
                        (smpda's own ScannedCode) - see wpsApi's
                        order_items_progress, issued_batches. */}
                    {item.issuedBatches && (
                      <span className="block text-xs text-gray-400 dark:text-neutral-500">
                        {t("itemBatch", { value: item.issuedBatches })}
                      </span>
                    )}
                  </span>
                </div>
                {/* The transport guideline for this exact (line, material) - what
                    the forklift operator needs to know, e.g. "krótkie odcinki".
                    Resolved server-side (wpsApi's order_items_progress), not
                    matched here: that is what left smpda/smVendor/smOrder showing
                    nothing while this screen had it. A guideline saved with no
                    material is about the whole line and rides on the order as
                    lineRuleNote instead. */}
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
        <PhotoThumbnail
          photo={order.photo}
          t={t}
          className="h-28 w-full rounded-md border border-gray-200 object-cover dark:border-neutral-700"
        />
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

      {/* Status actions only make sense on the working queue - see wpsapi's
          take/complete/cancel/acceptOrder and this component's own
          handlers. A `delivered` row is the requester's own "Zgadza
          się"/"Zgłoś problem" (what the forklift operator just delivered,
          via smVendor's "Dostarczone") instead of the generic
          take/complete/cancel, which don't apply to it any more - see
          deliverOrder's own comment on why completing it directly would
          skip that bookkeeping. */}
      {order.status === "problem" && order.problemNote && (
        <div className="rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">
          {t("timeline.problem")}: {order.problemNote}
          {order.problemReportedBy ? ` (${order.problemReportedBy})` : ""}
        </div>
      )}
      {mode === "active" && order.status === "problem" && (
        <div className="flex items-center gap-1.5 border-t border-gray-100 dark:border-neutral-800 pt-2">
          {order.problemReportedFrom === "inProgress" ? (
            <Button size="sm" onClick={() => onResolveProblem(order)}>
              {t("actions.resolveProblem")}
            </Button>
          ) : (
            <span className="text-xs text-gray-400 dark:text-neutral-500">{t("actions.problemWithVendor")}</span>
          )}
        </div>
      )}
      {mode === "active" && order.status === "delivered" && (
        <div className="flex items-center gap-1.5 border-t border-gray-100 dark:border-neutral-800 pt-2">
          <Button size="sm" variant="outline" onClick={() => onReportProblem(order)}>
            {t("actions.reportProblem")}
          </Button>
          <Button size="sm" onClick={() => onAccept(order)}>
            {t("actions.accept")}
          </Button>
        </div>
      )}
      {mode === "active" && order.status !== "delivered" && order.status !== "problem" && (
        <div className="flex items-center gap-1.5 border-t border-gray-100 dark:border-neutral-800 pt-2">
          {order.status === "new" && (
            <Button size="sm" variant="outline" onClick={() => onTake(order)}>
              {t("actions.take")}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => onComplete(order)}>
            {t("actions.complete")}
          </Button>
          {/* Only while nobody has started it - see the table's own note. */}
          {order.status === "new" && (
            <Button size="sm" variant="outline" onClick={() => onCancel(order)}>
              {t("actions.cancel")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// Backed by wpsapi's orders/order_items (schema.sql) via lib/ordersApi.js -
// see that file's own comment and wpsApi's AGENTS.md "Transport orders".
// Not built on the shared MaterialsTable - that component's columns all
// read one flat row shape, and an order's own fields (status/line/
// employeeNo) share nothing with its line items' (itemNo/itemName/
// quantity), so this instead mirrors SmMaterialsPanel's own hand-rolled
// groupParent/groupChild expand pattern: a chevron toggles each order row
// open to reveal what it holds (its type-specific values and its ordered
// items) indented underneath, same tree-line treatment.
// Lista zamówień = still open (new/in_progress) - the working queue;
// Historia zamówień = closed (done/cancelled) - the archive. A closed order
// leaves the queue the moment it's marked done/cancelled, no grace period -
// see AGENTS.md's "Zamówienia" section for the reasoning. Each mode is its
// own fetch (`?scope=active`/`?scope=history`) rather than one fetch
// filtered client-side, straight off wpsapi's own split.
const SCOPES = { active: "active", history: "history" };

export default function OrdersCipListTable({ mode = "active" }) {
  const t = useTranslations("ordersTransport");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState({});
  // Per-order event log, keyed by order id, filled on expand (see toggle).
  const [eventsById, setEventsById] = useState({});
  const [ordersData, setOrdersData] = useState([]);
  const [loadStatus, setLoadStatus] = useState("loading"); // loading | ready | error
  const [locationPool, setLocationPool] = useState(LINE_CODES);
  const [newOrderType, setNewOrderType] = useState(null);
  const [viewMode, setViewMode] = useState("table");

  const reload = useMemo(
    () => () => {
      setLoadStatus((prev) => (prev === "ready" ? prev : "loading"));
      ordersApi
        .list(SCOPES[mode])
        .then((rows) => {
          setOrdersData(rows);
          setLoadStatus("ready");
        })
        .catch(() => setLoadStatus("error"));
    },
    [mode]
  );

  useEffect(() => {
    reload();
  }, [reload]);

  // Live updates: every status change (Weź/Zrealizuj/Anuluj/Dostarczone,
  // wherever it's made from - smVendor and smpda both write to the same
  // orders table) shows up here on its own, no manual refresh. A plain
  // poll (not a GraphQL/Hasura subscription): same reasoning as smVendor's
  // own OrdersPage - Hasura subscriptions are themselves short-interval
  // polling under the hood (no LISTEN/NOTIFY), so this gets the same felt
  // "live" behaviour without adding a GraphQL-WS client here. Silent on
  // failure (unlike reload() above) - a transient hiccup must not blank
  // the table out from under someone reading it; the next tick retries on
  // its own.
  useEffect(() => {
    const poll = setInterval(() => {
      ordersApi
        .list(SCOPES[mode])
        .then((rows) => setOrdersData(rows))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(poll);
  }, [mode]);

  useEffect(() => {
    // Every known place (fixed lines + whatever was typed on an earlier
    // goods_transport order) - straight from `locations`, not derived from
    // whichever orders happen to be loaded in this mode.
    ordersApi.locations().then(setLocationPool).catch(() => {});
  }, []);

  // Takes the whole order, not just its number: expanding is also what
  // triggers the one fetch this screen does per row (its event log).
  function toggle(order) {
    const opening = !expanded[order.orderNo];
    setExpanded((prev) => ({ ...prev, [order.orderNo]: opening }));
    // Re-fetched every time it is opened rather than cached once: a row
    // left collapsed for ten minutes has usually moved on since.
    if (opening) {
      ordersApi
        .events(order.id)
        .then((rows) => setEventsById((prev) => ({ ...prev, [order.id]: rows })))
        .catch(() => {});
    }
  }

  // New order always lands as "new" (see wpsapi's createOrder) - always
  // active mode's own concern, so it's prepended here directly rather than
  // waiting on a reload; history's own fetch is untouched by this.
  async function handleCreateOrder(input) {
    const order = await ordersApi.create(input);
    if (mode === "active") setOrdersData((prev) => [order, ...prev]);
  }

  // The three status actions (see wpsapi's take/complete/cancelOrder) - all
  // three move an order out of "active" (new/in_progress) into either still
  // active (take: new -> in_progress) or history (complete/cancel) - so a
  // successful call always just drops the row from whatever's on screen
  // right now (mode="active") rather than trying to patch its new status in
  // place; history's own view picks it up on its own next visit/reload.
  async function handleTake(order) {
    const session = await getCipSession().catch(() => null);
    const updated = await ordersApi.take(order.id, session?.userId ?? "");
    setOrdersData((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
  }
  async function handleComplete(order) {
    const session = await getCipSession().catch(() => null);
    await ordersApi.complete(order.id, session?.userId ?? "");
    setOrdersData((prev) => prev.filter((o) => o.id !== order.id));
  }
  async function handleCancel(order) {
    const reason = window.prompt(t("actions.cancelReasonPrompt")) ?? "";
    await ordersApi.cancel(order.id, reason);
    setOrdersData((prev) => prev.filter((o) => o.id !== order.id));
  }
  // "Zgłoś problem" on a delivered row - the requester rejecting what
  // arrived. Goes into the problem loop (the forklift operator answers it),
  // never to `cancel`: a rejected delivery is not the end of the transport.
  // The row stays on the active list, so it is replaced in place.
  async function handleReportProblem(order) {
    const note = (window.prompt(t("actions.problemNotePrompt")) ?? "").trim();
    if (!note) return;
    const session = await getCipSession().catch(() => null);
    const updated = await ordersApi.reportProblem(order.id, session?.userId ?? "", note);
    setOrdersData((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
  }
  // "Zgadza się" - delivered -> done, the requester's own confirmation that
  // what the forklift operator delivered (smVendor's "Dostarczone") is
  // correct. Shown instead of take/complete/cancel for a `delivered` row -
  // see the actions column's own switch below.
  async function handleAccept(order) {
    const session = await getCipSession().catch(() => null);
    await ordersApi.accept(order.id, session?.userId ?? "");
    setOrdersData((prev) => prev.filter((o) => o.id !== order.id));
  }

  // "Problem rozwiązany" - problem -> in_progress, the answer to what the
  // forklift operator reported. The row stays in this list (it is still an
  // active order), so unlike accept/cancel above it is replaced in place
  // rather than removed.
  async function handleResolveProblem(order) {
    const session = await getCipSession().catch(() => null);
    const updated = await ordersApi.resolveProblem(order.id, session?.userId ?? "");
    setOrdersData((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
  }

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

        {loadStatus === "error" && (
          <p className="rounded-lg border border-dashed border-red-200 dark:border-red-900/50 py-8 text-center text-sm text-red-600 dark:text-red-400">
            {t("loadError")}
          </p>
        )}
        {loadStatus !== "error" && viewMode === "cards" ? (
          orders.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 dark:border-neutral-800 py-8 text-center text-sm text-gray-400 dark:text-neutral-500">
              {t(loadStatus === "loading" ? "loading" : "emptyStatus")}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {orders.map((order) => (
                <OrderCard
                  key={order.orderNo}
                  order={order}
                  t={t}
                  mode={mode}
                  onTake={handleTake}
                  onComplete={handleComplete}
                  onCancel={handleCancel}
                  onAccept={handleAccept}
                  onReportProblem={handleReportProblem}
                  onResolveProblem={handleResolveProblem}
                />
              ))}
            </div>
          )
        ) : loadStatus !== "error" && (
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
                <TableHead className={mode === "active" ? HEAD_CLS : `pr-4 ${HEAD_CLS}`}>{t("columns.note")}</TableHead>
                {mode === "active" && <TableHead className={`pr-4 text-right ${HEAD_CLS}`}>{t("columns.actions")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={mode === "active" ? 10 : 9} className="py-8 text-center text-sm text-gray-400 dark:text-neutral-500">
                    {t(loadStatus === "loading" ? "loading" : "emptyStatus")}
                  </TableCell>
                </TableRow>
              )}
              {orders.map((order) => {
                const details = detailLines(order, t);
                const productionLine = productionOrderNoLine(order, t);
                const items = order.items ?? [];
                const expandable = details.length > 0 || Boolean(productionLine) || items.length > 0 || Boolean(order.photo);
                const isOpen = expandable && Boolean(expanded[order.orderNo]);
                return (
                  <Fragment key={order.orderNo}>
                    <TableRow onClick={expandable ? () => toggle(order) : undefined} className={expandable ? "cursor-pointer" : undefined}>
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
                      <TableCell className={mode === "active" ? CELL_CLS : `pr-4 ${CELL_CLS}`}>{order.note}</TableCell>
                      {mode === "active" && (
                        <TableCell className="pr-4" onClick={(e) => e.stopPropagation()}>
                          {/* A `delivered` row is the requester's own
                              "Zgadza się"/"Zgłoś problem" - see OrderCard's
                              own comment on why take/complete/cancel don't
                              apply to it any more. */}
                          {order.status === "problem" ? (
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Only the side the problem was reported *to*
                                  can answer it: a problem the operator
                                  reported is the requester's to resolve
                                  (here), one the requester reported is the
                                  operator's, in smVendor. */}
                              {order.problemReportedFrom === "inProgress" ? (
                                <Button size="sm" onClick={() => handleResolveProblem(order)}>
                                  {t("actions.resolveProblem")}
                                </Button>
                              ) : (
                                <span className="text-xs text-gray-400 dark:text-neutral-500">
                                  {t("actions.problemWithVendor")}
                                </span>
                              )}
                            </div>
                          ) : order.status === "delivered" ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button size="sm" variant="outline" onClick={() => handleReportProblem(order)}>
                                {t("actions.reportProblem")}
                              </Button>
                              <Button size="sm" onClick={() => handleAccept(order)}>
                                {t("actions.accept")}
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              {order.status === "new" && (
                                <Button size="sm" variant="outline" onClick={() => handleTake(order)}>
                                  {t("actions.take")}
                                </Button>
                              )}
                              <Button size="sm" variant="outline" onClick={() => handleComplete(order)}>
                                {t("actions.complete")}
                              </Button>
                              {/* Cancelling is for an order nobody has started
                                  yet - see wpsapi's cancelOrder, which refuses
                                  the rest. Once it is being carried, the way
                                  out is the problem loop, not a cancellation,
                                  and this is the only app that offers it at
                                  all. */}
                              {order.status === "new" && (
                                <Button size="sm" variant="outline" onClick={() => handleCancel(order)}>
                                  {t("actions.cancel")}
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                    {isOpen && productionLine && (
                      <TableRow className="bg-gray-50/60 dark:bg-neutral-900/40">
                        <TableCell className="relative w-8 pl-4">
                          <span className="absolute inset-y-0 left-6 flex w-3.5 justify-center">
                            <span className="h-full w-px bg-gray-300 dark:bg-neutral-600" />
                          </span>
                        </TableCell>
                        <TableCell colSpan={mode === "active" ? 9 : 8} className={`pl-2 pr-4 ${CELL_CLS}`}>
                          <div className="flex items-center justify-between">
                            <span>{productionLine}</span>
                            <OrderStageTimeline order={order} t={t} />
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    {/* The line's own guideline, whatever is being brought -
                        see OrderCard's own comment. */}
                    {isOpen && order.lineRuleNote && (
                      <TableRow className="bg-gray-50/60 dark:bg-neutral-900/40">
                        <TableCell className="relative w-8 pl-4">
                          <span className="absolute inset-y-0 left-6 flex w-3.5 justify-center">
                            <span className="h-full w-px bg-gray-300 dark:bg-neutral-600" />
                          </span>
                        </TableCell>
                        <TableCell colSpan={mode === "active" ? 9 : 8} className="pl-2 pr-4">
                          <span className="inline-block rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                            {order.lineRuleNote}
                          </span>
                        </TableCell>
                      </TableRow>
                    )}
                    {isOpen && details.length > 0 && (
                      <TableRow className="bg-gray-50/60 dark:bg-neutral-900/40">
                        <TableCell className="relative w-8 pl-4">
                          <span className="absolute inset-y-0 left-6 flex w-3.5 justify-center">
                            <span className="h-full w-px bg-gray-300 dark:bg-neutral-600" />
                          </span>
                        </TableCell>
                        <TableCell colSpan={mode === "active" ? 9 : 8} className={`pl-2 pr-4 ${CELL_CLS}`}>
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
                        <TableCell colSpan={mode === "active" ? 9 : 8} className="py-2 pl-2 pr-4">
                          <PhotoThumbnail
                            photo={order.photo}
                            t={t}
                            className="h-20 rounded-md border border-gray-200 object-cover dark:border-neutral-700"
                          />
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
                            {/* The transport guideline for this exact (line, material) - what
                                the forklift operator needs to know, e.g. "krótkie odcinki".
                                Resolved server-side (wpsApi's order_items_progress), not
                                matched here: that is what left smpda/smVendor/smOrder showing
                                nothing while this screen had it. A guideline saved with no
                                material is about the whole line and rides on the order as
                                lineRuleNote instead. */}
                            {item.ruleNote && (
                              <p className="mt-0.5 inline-block rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                                {item.ruleNote}
                              </p>
                              )}
                          </TableCell>
                          <TableCell className={`tabular-nums ${CELL_CLS}`}>
                            {/* "Wydano: ..." - see OrderCard's own comment
                                on issuedLineValue. Already ends in
                                "/{ordered} szt.", so this is the only
                                quantity shown once something's issued - no
                                separate ordered-quantity line above it. */}
                            {hasIssued(item) && <span className="block">{t("itemIssued", { value: issuedLineValue(item) })}</span>}
                            {/* Every distinct batch the issuing scan(s)
                                carried - see OrderCard's own comment. */}
                            {item.issuedBatches && (
                              <span className="mt-0.5 block text-xs text-gray-400 dark:text-neutral-500">
                                {t("itemBatch", { value: item.issuedBatches })}
                              </span>
                            )}
                          </TableCell>
                          <TableCell colSpan={mode === "active" ? 5 : 4} className={`pr-4 text-gray-400 dark:text-neutral-500`}>
                            {item.note}
                          </TableCell>
                        </TableRow>
                      ))}
                    {/* What is blocking it right now, in the operator's own
                        words - the one thing somebody looking at a stuck
                        order needs before anything else. */}
                    {isOpen && order.status === "problem" && order.problemNote && (
                      <TableRow className="bg-gray-50/60 dark:bg-neutral-900/40">
                        <TableCell className="relative w-8 pl-4">
                          <span className="absolute inset-y-0 left-6 flex w-3.5 justify-center">
                            <span className="h-full w-px bg-gray-300 dark:bg-neutral-600" />
                          </span>
                        </TableCell>
                        <TableCell colSpan={mode === "active" ? 9 : 8} className="pl-2 pr-4">
                          <span className="inline-block rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">
                            {t("timeline.problem")}: {order.problemNote}
                            {order.problemReportedBy ? ` (${order.problemReportedBy})` : ""}
                          </span>
                        </TableCell>
                      </TableRow>
                    )}
                    {/* The whole sequence, last - it answers "what
                        happened here", which only comes up after the order
                        itself has been read. Absent until the fetch lands,
                        and absent for good if it fails: a missing log must
                        not break the row. */}
                    {isOpen && (eventsById[order.id]?.length ?? 0) > 0 && (
                      <TableRow className="bg-gray-50/60 dark:bg-neutral-900/40">
                        <TableCell className="relative w-8 pl-4">
                          <span className="absolute inset-y-0 left-6 flex w-3.5 justify-center">
                            <span className="h-full w-px bg-gray-300 dark:bg-neutral-600" />
                          </span>
                        </TableCell>
                        <TableCell colSpan={mode === "active" ? 9 : 8} className="py-2 pl-2 pr-4">
                          <OrderEventLog events={eventsById[order.id]} t={t} />
                        </TableCell>
                      </TableRow>
                    )}
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
