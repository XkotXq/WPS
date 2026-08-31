export const frpColumns = [
  { key: "lp", headerKey: "lp", filterFn: "weakEquals", sortable: true },
  { key: "item", headerKey: "item", filterFn: "includesString", sortable: true },
  { key: "diameter", headerKey: "diameter", filterFn: "includesString", sortable: true },
  { key: "length", headerKey: "length", filterFn: "inNumberRange", sortable: true },
  { key: "xbz", headerKey: "xbz", filterFn: "includesString", sortable: true },
  { key: "spoolNumber", headerKey: "spoolNumber", filterFn: "includesString" },
  { key: "location", headerKey: "location", filterFn: "includesString", sortable: true },
  { key: "note", headerKey: "note", filterFn: "includesString" },
];

export const coatedFrpColumns = [
  { key: "lp", headerKey: "lp", filterFn: "weakEquals", sortable: true },
  { key: "diameter", headerKey: "diameter", filterFn: "includesString", sortable: true },
  { key: "length", headerKey: "length", filterFn: "includesString", sortable: true },
  { key: "xbz", headerKey: "xbz", filterFn: "includesString" },
  { key: "spoolNumber", headerKey: "spoolNumber", filterFn: "includesString" },
  { key: "location", headerKey: "location", filterFn: "includesString", sortable: true },
  { key: "note", headerKey: "note", filterFn: "includesString" },
];

export const fillerColumns = [
  { key: "lp", headerKey: "lp", filterFn: "weakEquals", sortable: true },
  { key: "color", headerKey: "color", filterFn: "includesString", sortable: true },
  { key: "diameter", headerKey: "diameter", filterFn: "includesString", sortable: true },
  { key: "length", headerKey: "lengthPlain", filterFn: "includesString", sortable: true },
  { key: "spoolNumber", headerKey: "spoolNumber", filterFn: "includesString" },
  { key: "flameRetardant", headerKey: "flameRetardant", type: "boolean", filterFn: "equals" },
  { key: "location", headerKey: "location", filterFn: "includesString", sortable: true },
  { key: "note", headerKey: "note", filterFn: "includesString" },
];

// The API stores length in meters; the "length" column here is labeled
// "Długość (km)" (see messages/*.json), so it's converted for display
// only — the database value itself stays in meters.
function metersToKm(raw) {
  const meters = Number(raw);
  if (!Number.isFinite(meters)) return raw ?? "";
  return Number((meters / 1000).toFixed(3));
}

// Maps a snapshot row from GET /stocks/:stocksId/:material (yfoc/api) to
// the row shape MaterialsTable/*Columns above expect.
export function mapFrpItem(item, index) {
  return {
    id: item.id,
    lp: index + 1,
    item: item.itemNumber ?? item.frpItemNumber ?? "",
    diameter: item.frpLabel ?? "",
    length: metersToKm(item.length),
    xbz: item.type ?? "",
    spoolNumber: item.drumNumber ?? "",
    location: item.location ?? "",
    note: item.remark ?? "",
    mmc: Boolean(item.mmc),
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
// shape MaterialsTable expects — it needs a stable "id" for getRowId.
export function mapCatalogEntry(item) {
  return { id: item.number, ...item };
}
