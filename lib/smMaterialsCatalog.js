import { SM_INITIAL_ITEMS } from "./smMaterialsSeed";

// Local-only reference catalog of known SM materials (itemNo + itemName) -
// separate from SmMaterialsPanel's own `items` state, which is current
// *stock* (quantities/locations/units), not a master list of materials
// that exist. This is what "Katalog materiałów SM" manages and what
// ReceiveUnitPanel's handleItemNoBlur looks item names up against, so a
// material still shows an autofilled name even once every unit of it has
// been issued off the stock list (and its stock-only entry is gone).
export const SM_CATALOG_STORAGE_KEY = "wps-sm-materials-catalog";

// Deduplicated from the stock seed's own itemNo/itemName pairs so the
// catalog starts out matching what's already on the shelf, instead of
// empty - same reasoning as SM_HISTORY_SEED in lib/smOperationHistory.js.
// `individualUnits`/`unitType` are read straight off each seed item's own
// `trackedIndividually`/`units[0].unitType` (see lib/smMaterialsSeed.js)
// rather than defaulted, so e.g. the aggregate yarn/masterbatch/tape rows
// come in as "Nie" (not individually tracked, no unit form) and the
// bigbag-tracked filler/PP rows come in as "Bigbag" instead of every
// single entry starting out as an individually-tracked spool. `unitType`
// stays undefined for an aggregate material since it has no per-unit form
// to speak of; the catalog form only shows/sends it while individualUnits
// is checked.
function dedupeByItemNo(items) {
  const seen = new Map();
  items.forEach((it) => {
    if (seen.has(it.itemNo)) return;
    const individualUnits = Boolean(it.trackedIndividually);
    const unitType = individualUnits ? it.units?.[0]?.unitType ?? "spool" : undefined;
    seen.set(it.itemNo, { itemNo: it.itemNo, itemName: it.itemName, individualUnits, unitType });
  });
  return [...seen.values()];
}

export const SM_CATALOG_SEED = dedupeByItemNo(SM_INITIAL_ITEMS);
