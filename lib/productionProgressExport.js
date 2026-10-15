// The "Postęp produkcji" answer as a workbook: **one sheet, read down**, the
// way the screen is read - a banded row naming the production line, then that
// line's orders under it.
//
// Three columns and no more (asked for on 2026-10-12, after a first version
// put every line on its own tab and every figure in its own column): the
// order, what is left **of that line's own work on it**, and everything the
// line takes in one cell - the FRP and the bagged materials together, each
// bagged one carrying how much of it a kilometre of cable takes. That cell is
// what somebody loading a trolley reads, and splitting it across columns only
// made them scroll.

//
// Every figure here is one the API already worked out and the screen already
// shows (see wpsapi's src/productionProgress.js). Nothing is derived a second
// time, so the file and the screen cannot disagree; the only thing this file
// decides is the shape.
import { downloadStockXlsx } from "@/lib/xlsxExport";
import { lineMaterials } from "@/lib/lineMaterials";

// Enough for two materials and their names without the row growing a
// scrollbar of its own; Excel wraps the rest.
const MATERIALS_COL_WIDTH = 70;

const kmFormat = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 3 });
const perKmFormat = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 4 });

const num = (value, places = 3) => {
  const n = Number(value);
  if (value === null || value === undefined || !Number.isFinite(n)) return "";
  return Number(n.toFixed(places));
};

// What one material line reads as: **the item number first**, since that is
// what anything is ordered and picked by, then the name, then what is still to
// issue of it in its own unit - and, for the compound, which is ordered in
// bigbags, what a kilometre of cable takes, since that is the figure you
// multiply by when the plan changes. FRP has no bracket: a roll is ordered by
// the length printed on it.
function materialText(item, withPerKm) {
  const quantity = item.remainingQuantity ?? item.requiredQuantity;
  const amount = quantity === null || quantity === undefined ? "—" : `${kmFormat.format(quantity)} ${item.unit}`;
  const rate =
    withPerKm && item.perKm !== null && item.perKm !== undefined
      ? ` (${perKmFormat.format(item.perKm)} ${item.unit}/km)`
      : "";
  return `${item.itemNo} · ${item.name} · ${amount}${rate}`;
}

/**
 * `groups` is what the screen renders (`{ line, rows, summary }` per line) and
 * `perKmGroups` the material groups whose entry carries its per-kilometre
 * rate - the ones that come in bigbags, so the caller does not have to know
 * which keys those are.
 *
 * Split from the download itself so the sheet can be asserted on without a
 * browser - a header row and its cells drifting apart by one column is the
 * failure this file is most likely to have, and it is invisible until
 * somebody opens the file.
 */
export function buildProgressSheets({ groups, perKmGroups = ["tube", "jacket"], t }) {
  const rows = [];
  const sectionRows = [];

  for (const group of groups) {
    sectionRows.push(rows.length);
    rows.push([group.line || t("noLine"), "", ""]);

    for (const row of group.rows) {
      if (!row.found) {
        rows.push([row.orderId || row.orderNumber, "", t("notFound")]);
        continue;
      }
      // What **this line** puts into the cable, not the whole cable's BOM -
      // a sheathing line was being sent FRP it cannot use (see
      // lib/lineMaterials.js). Both kinds in the one cell, FRP first, each on
      // its own line: the order they are read in and fetched in.
      const materials = Object.entries(lineMaterials(row) ?? {})
        .sort(([a], [b]) => (a === "frp" ? -1 : b === "frp" ? 1 : 0))
        .flatMap(([key, list]) => (list ?? []).map((item) => materialText(item, perKmGroups.includes(key))))
        .join("\n");
      // What is left **for this line** - its own stage's remainder, which is
      // not the order's: a position can be stranded and still have its whole
      // jacket to go (2026-10-13). The screen can afford both figures in two
      // columns; three columns can only carry the one the line is planned
      // by, and that is this one. Already in kilometres of cable, whatever
      // unit the stage counts in, and already worked out by the API.
      rows.push([row.orderId || row.orderNumber, num(row.lineRemainingLength ?? row.remainingLength), materials]);
    }
  }

  return [
    {
      sheetName: t("export.title"),
      title: t("export.title"),
      headers: [t("export.columns.orderNumber"), t("export.columns.remaining"), t("export.columns.materials")],
      rows,
      sectionRows,
      wrapCols: [2],
      colWidths: [28, 14, MATERIALS_COL_WIDTH],
    },
  ];
}

export async function downloadProductionProgress(options) {
  const sheets = buildProgressSheets(options);
  const pad = (v) => String(v).padStart(2, "0");
  const now = new Date();
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(
    now.getMinutes()
  )}`;
  await downloadStockXlsx({ fileName: `postep_produkcji_${stamp}.xlsx`, sheets });
}
