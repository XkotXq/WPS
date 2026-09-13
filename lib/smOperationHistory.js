// Shared between SmMaterialsPanel (writer) and SmMaterialsHistoryTable
// (reader) - both call usehooks-ts's useLocalStorage with this exact key,
// which is what lets a receipt/issue made on /materials-list-sm show up on
// /materials-list-sm/history-sm without any shared backend (see AGENTS.md:
// nothing in Materiały SM persists anywhere real yet - this is a
// per-device log, not a synced one).
export const SM_HISTORY_STORAGE_KEY = "wps-sm-operation-history";

// Caps how many entries the log keeps, same idea as the 500-row cap
// CipMaterialsHistoryTable notes for the real CIP history (an
// infrequently-touched item's oldest rows fall out first since entries
// are always prepended newest-first).
export const SM_HISTORY_LIMIT = 500;

let seq = 0;

// Unique even when several entries are logged within the same
// millisecond (e.g. a group/bulk issue covering multiple units at once).
export function makeSmHistoryId() {
  seq += 1;
  return `h-${Date.now()}-${seq}`;
}

// Minutes-ago offset from whenever this module first evaluates - keeps the
// seed looking "recent" on every load instead of freezing to a fixed past
// date (same reasoning as SM_INITIAL_ITEMS being fictional-but-realistic
// data, see lib/smMaterialsSeed.js).
function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

// CIP's own employee codes (what a real session's `username` actually
// looks like - see getCipSession() in SmMaterialsPanel) are "460" plus a
// random 4-digit suffix, e.g. "4601270" - not a name. Three distinct codes
// reused below so the sample data still reads as "a handful of different
// people", consistent with the real format instead of placeholder names.
const SEED_OPERATORS = ["4601270", "4608934", "4604519"];

// Example history so /materials-list-sm/history-sm isn't empty on first
// load - itemNo/itemName/unitId/location values are pulled from
// SM_INITIAL_ITEMS (lib/smMaterialsSeed.js) so this reads as "this item's
// own past", not unrelated placeholder rows. Passed as the initialValue to
// both useLocalStorage calls (SmMaterialsPanel and SmMaterialsHistoryTable)
// - only takes effect the very first time, before anyone has logged a real
// operation on this device.
export const SM_HISTORY_SEED = [
  { id: "h-seed-1", operation: "issue", itemNo: "993916000000219", itemName: "FRP 1.8mm/VIP", unitId: "Y450", quantity: "48.800", location: "ST 01", operator: SEED_OPERATORS[0], time: minutesAgo(35) },
  { id: "h-seed-2", operation: "receipt", itemNo: "993916000000404", itemName: "Coated FRP 1.8/1.9-/-M", unitId: "SZP-2231", quantity: "48.800", location: "MT", operator: SEED_OPERATORS[1], time: minutesAgo(190) },
  { id: "h-seed-3", operation: "issue", itemNo: "993916000000900", itemName: "Nici Aramid 1610", unitId: "", quantity: "15", location: "WS 01", operator: SEED_OPERATORS[2], time: minutesAgo(420) },
  { id: "h-seed-4", operation: "receipt", itemNo: "993916000000304", itemName: "FRP 3.5mm/VIP", unitId: "Y310", quantity: "3.076", location: "MT", operator: SEED_OPERATORS[0], time: minutesAgo(900) },
  { id: "h-seed-5", operation: "issue", itemNo: "993916000000219", itemName: "FRP 1.8mm/VIP", unitId: "Y402", quantity: "48.800", location: "ST 01", operator: SEED_OPERATORS[1], time: minutesAgo(1320) },
  { id: "h-seed-6", operation: "receipt", itemNo: "993916000000129", itemName: "Coated FRP/1.8*1.9-/-M", unitId: "G612", quantity: "1.570", location: "MT", operator: SEED_OPERATORS[2], time: minutesAgo(1800) },
  { id: "h-seed-7", operation: "issue", itemNo: "993916000000239", itemName: "Coated FRP/1.3mm*1.4mm", unitId: "SZP-2233", quantity: "12.400", location: "MT", operator: SEED_OPERATORS[0], time: minutesAgo(2450) },
  { id: "h-seed-8", operation: "receipt", itemNo: "993916000000115", itemName: "FRP/Φ3.7mm", unitId: "F109", quantity: "4.091", location: "MT", operator: SEED_OPERATORS[1], time: minutesAgo(2900) },
];
