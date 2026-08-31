export const frpColumns = [
  { key: "lp", headerKey: "lp", filterFn: "weakEquals", sortable: true },
  // simpleKey lets the header's toggle icon (see MaterialsTable) switch
  // these cells between the full value and a shorter one - item number
  // down to its last 3 digits, diameter down to just the short label.
  { key: "item", headerKey: "item", filterFn: "multiselect", sortable: true, simpleKey: "itemShort" },
  { key: "diameter", headerKey: "diameter", filterFn: "multiselect", sortable: true, simpleKey: "diameterShort" },
  { key: "length", headerKey: "length", filterFn: "inNumberRange", sortable: true },
  { key: "xbz", headerKey: "xbz", filterFn: "includesString", sortable: true },
  { key: "spoolNumber", headerKey: "spoolNumber", filterFn: "includesString" },
  { key: "location", headerKey: "location", filterFn: "includesString", sortable: true },
  { key: "note", headerKey: "note", filterFn: "includesString" },
];

export const coatedFrpColumns = [
  { key: "lp", headerKey: "lp", filterFn: "weakEquals", sortable: true },
  { key: "diameter", headerKey: "diameter", filterFn: "multiselect", sortable: true },
  { key: "length", headerKey: "length", filterFn: "includesString", sortable: true },
  { key: "xbz", headerKey: "xbz", filterFn: "includesString" },
  { key: "spoolNumber", headerKey: "spoolNumber", filterFn: "includesString" },
  { key: "location", headerKey: "location", filterFn: "includesString", sortable: true },
  { key: "note", headerKey: "note", filterFn: "includesString" },
];

export const fillerColumns = [
  { key: "lp", headerKey: "lp", filterFn: "weakEquals", sortable: true },
  { key: "color", headerKey: "color", filterFn: "includesString", sortable: true },
  { key: "diameter", headerKey: "diameter", filterFn: "multiselect", sortable: true },
  { key: "length", headerKey: "lengthPlain", filterFn: "includesString", sortable: true },
  { key: "spoolNumber", headerKey: "spoolNumber", filterFn: "includesString" },
  { key: "flameRetardant", headerKey: "flameRetardant", type: "boolean", filterFn: "equals" },
  { key: "location", headerKey: "location", filterFn: "includesString", sortable: true },
  { key: "note", headerKey: "note", filterFn: "includesString" },
];

// The API stores length in meters; the "length" column here is labeled
// "Długość (km)" (see messages/*.json), so it's converted for display
// only - the database value itself stays in meters.
function metersToKm(raw) {
  const meters = Number(raw);
  if (!Number.isFinite(meters)) return raw ?? "";
  return Number((meters / 1000).toFixed(3));
}

// The row keeps the raw ISO timestamp (so sorting stays chronological -
// ISO 8601 sorts lexicographically the same as by date); MaterialsTable
// formats it for display based on `type: "datetime"` (like the "boolean"
// type) rather than a `render` function - this column config is passed
// from a server component (current/page.js) down into a client component,
// and functions can't cross that boundary as props.
const createdAtColumn = {
  key: "createdAt",
  headerKey: "createdAt",
  filterFn: "includesString",
  sortable: true,
  type: "datetime",
};

// Current-list variants (see /dashboard/stock/current) add a "when was
// this added" column on top of the base columns shared with the
// historical stock-take view, where it wouldn't mean anything.
export const frpCurrentColumns = [...frpColumns, createdAtColumn];
export const coatedFrpCurrentColumns = [...coatedFrpColumns, createdAtColumn];
export const fillerCurrentColumns = [...fillerColumns, createdAtColumn];

// Maps a snapshot row from GET /stocks/:stocksId/:material (yfoc/api) to
// the row shape MaterialsTable/*Columns above expect.
export function mapFrpItem(item, index) {
  return {
    id: item.id,
    lp: index + 1,
    item: item.itemNumber ?? item.frpItemNumber ?? "",
    itemShort: String(item.itemNumber ?? item.frpItemNumber ?? "").slice(-3),
    // Full catalog name (e.g. "2.2mmFRP/suppleness-FRP") instead of just
    // the short diameter label - falls back to the label when an item's
    // number isn't in the catalog, so the cell is never blank. The field
    // is named differently depending on which API endpoint fed this row:
    // frpName from live items (items.js rowToApi), name from a historical
    // stock-take snapshot (checks.js stockRowToSnapshotApi).
    diameter: item.frpName || item.name || item.frpLabel || "",
    diameterShort: item.frpLabel || "",
    length: metersToKm(item.length),
    xbz: item.type ?? "",
    spoolNumber: item.drumNumber ?? "",
    location: item.location ?? "",
    note: item.remark ?? "",
    mmc: Boolean(item.mmc),
    createdAt: item.createdAt ?? "",
  };
}

export function mapCoatedFrpItem(item, index) {
  return {
    id: item.id,
    lp: index + 1,
    diameter: item.diameter ?? "",
    length: metersToKm(item.length),
    xbz: item.type ?? "",
    spoolNumber: item.drumNumber ?? "",
    location: item.location ?? "",
    note: item.remark ?? "",
    createdAt: item.createdAt ?? "",
  };
}

export function mapFillerItem(item, index) {
  return {
    id: item.id,
    lp: index + 1,
    color: item.color ?? "",
    diameter: item.diameter ?? "",
    length: item.length ?? "",
    spoolNumber: item.drumNumber ?? "",
    flameRetardant: Boolean(item.flameproof),
    location: item.location ?? "",
    note: item.remark ?? "",
    createdAt: item.createdAt ?? "",
  };
}

export const MATERIAL_MAPPERS = {
  frp: mapFrpItem,
  coatedFrp: mapCoatedFrpItem,
  filler: mapFillerItem,
};

export const frpCatalogColumns = [
  { key: "number", headerKey: "itemNumber", filterFn: "includesString", sortable: true },
  { key: "label", headerKey: "label", filterFn: "includesString", sortable: true },
  { key: "name", headerKey: "name", filterFn: "includesString", sortable: true },
  { key: "type", headerKey: "xbz", filterFn: "includesString" },
  { key: "mmc", headerKey: "mmc", type: "boolean", filterFn: "equals" },
];

// Maps a GET /catalog row ({number, label, name, type, mmc}) to the row
// shape MaterialsTable expects - it needs a stable "id" for getRowId.
export function mapCatalogEntry(item) {
  return { id: item.number, ...item };
}
