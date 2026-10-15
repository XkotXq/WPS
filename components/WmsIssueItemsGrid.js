"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { DataEditor, CompactSelection } from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { Trash2 } from "lucide-react";
import { sanitizeQuantityInput } from "@/lib/quantityInput";
import { installInsecureClipboardFallback } from "@/lib/insecureClipboard";
import {
  makeTextCell,
  smTextCellRenderer,
  useIsDarkMode,
  useElementSize,
  LIGHT_THEME,
  DARK_THEME,
  gridHeightFor,
} from "./gridTextCell";

// The positions of a WMS issue list, in the same kind of grid "Przyjęcie
// zamówienia" uses (BulkReceiveGrid - this is its sibling, like
// ProductionProgressGrid): a column of item numbers goes in with one Ctrl+V
// out of Excel and each row fills itself in.
//
// **The one real difference from BulkReceiveGrid is where a name comes
// from.** There it is a lookup against data already in the browser, so it
// is a plain synchronous function. Here the item master is WMS's and lives
// behind a network call, so this grid cannot fill a row itself: it says
// *which* item numbers need resolving (`onResolveItemNos`) and the parent
// writes the answers back into `rows`. That is also why `itemStatus` is a
// prop - whether a number turned out to be a real material is something
// only the parent has heard back about.

const COLUMN_FIELDS = ["itemNo", "itemName", "unit", "location", "quantity"];

// `location` is **typed, not fetched**: it is the bin the material is taken
// out of, which is a fact about the shelf and not about the item, so WMS's
// item master does not know it and nothing here tries to fill it in. It
// pastes like any other column.

// Filled from WMS, not typed - a paste that only covers the item-number
// column must not wipe them, and they are what gets overwritten when an
// answer comes back. The specification was the third of these until it
// was dropped from the grid (2026-10-15); wpsApi still answers with it,
// so putting the column back is this list plus a column plus a write in
// the parent's own resolve.
const LOOKUP_FIELDS = ["itemName", "unit"];

// Over plain HTTP (the warehouse LAN) glide-data-grid's paste throws before
// it reaches its own event-based fallback - see the module for what this
// restores and why it is safe.
installInsecureClipboardFallback();

let wmsRowSeq = 0;
export function newWmsIssueRow() {
  wmsRowSeq += 1;
  return {
    id: `wms-${wmsRowSeq}`,
    itemNo: "",
    itemName: "",
    unit: "",
    location: "",
    quantity: "",
  };
}

function isRowEmpty(row) {
  return COLUMN_FIELDS.every((field) => !String(row[field] ?? "").trim());
}

// Excel-style "always one spare row", the same rule the other two grids
// follow, inside commitRows so every write path gets it.
function ensureSpareRow(rowsArr) {
  return rowsArr.some(isRowEmpty) ? rowsArr : [...rowsArr, newWmsIssueRow()];
}

/** The rows that actually hold a position - what gets counted and sent. */
export function filledWmsIssueRows(rows) {
  return (rows ?? []).filter((row) => String(row.itemNo ?? "").trim());
}

export default function WmsIssueItemsGrid({ rows, onChange, onAddRow, onResolveItemNos, itemStatus, t }) {
  const isDark = useIsDarkMode();
  const [containerRef, containerSize] = useElementSize();
  const [gridSelection, setGridSelection] = useState({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });
  const gridHeight = gridHeightFor(rows.length);

  // Mirrors `rows` but written synchronously, so a handler firing in the
  // same tick as a commit never reads a stale pre-edit snapshot - see
  // BulkReceiveGrid's own note on why the prop alone is not enough.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  function commitRows(next) {
    const withSpare = ensureSpareRow(next);
    rowsRef.current = withSpare;
    onChange(withSpare);
  }

  const columns = useMemo(
    () => [
      { title: t("grid.itemNo"), id: "itemNo", width: 180 },
      { title: t("grid.itemName"), id: "itemName", width: 300, grow: 1 },
      { title: t("grid.unit"), id: "unit", width: 80 },
      { title: t("grid.location"), id: "location", width: 130 },
      { title: t("grid.quantity"), id: "quantity", width: 110 },
    ],
    [t]
  );

  const getCellContent = useCallback(
    ([col, row]) => {
      const field = COLUMN_FIELDS[col];
      const rowData = rows[row];
      const value = rowData?.[field] ?? "";
      const itemNo = String(rowData?.itemNo ?? "").trim();
      // A row is "started" once it has an item number: nothing else is
      // worth marking before there is a material, and the item number is
      // what every other column hangs off.
      const started = Boolean(itemNo);
      const status = itemStatus?.[itemNo];
      // **Anything but a confirmed material is marked**, not only one WMS
      // refused: a number nobody has asked about yet is just as unfit to go
      // on an issue note, and that is the state a half-typed one is in. A
      // lookup in flight is the one exception - it is about to answer. This
      // is the same rule BulkReceiveGrid follows for an item number its own
      // lookup does not know, and it matches what blocks saving.
      const unresolved = started && field === "itemNo" && status !== "ok" && status !== "pending";
      const missingQuantity = started && field === "quantity" && !String(value).trim();
      return makeTextCell(value, unresolved || missingQuantity);
    },
    [rows, itemStatus]
  );

  // Type straight over a selected cell, Excel-style. Handled here rather
  // than through glide's own editOnType, which in this build restarts the
  // edit session on every keystroke - see BulkReceiveGrid for the detail.
  const typingCellRef = useRef(null);

  // Only "Ilość" is numeric; the rest is text, and the three WMS fills in
  // are not sanitised at all - whatever WMS calls a material is its name.
  function sanitizeField(field, value) {
    return field === "quantity" ? sanitizeQuantityInput(value) : value;
  }

  function handleGridKeyDown(event) {
    const [col, row] = event.location ?? [];
    const field = COLUMN_FIELDS[col];
    if (!field || !rows[row]) return;
    const typing = typingCellRef.current;
    const isSameCell = typing && typing.col === col && typing.row === row;

    if (event.key === "Escape" && isSameCell) {
      const next = rows.map((r) => ({ ...r }));
      next[row][field] = typing.original;
      commitRows(next);
      typingCellRef.current = null;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.key === "Backspace" && isSameCell) {
      const next = rows.map((r) => ({ ...r }));
      next[row][field] = String(rows[row][field] ?? "").slice(0, -1);
      commitRows(next);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.key.length !== 1 || event.ctrlKey || event.metaKey) return;

    const next = rows.map((r) => ({ ...r }));
    const base = isSameCell ? String(rows[row][field] ?? "") : "";
    const written = sanitizeField(field, base + event.key);
    // A rejected character (a letter typed into Ilość) sanitises back to
    // what it started from: nothing to write, and no fresh typingCellRef
    // either, or the next valid keystroke would replace instead of append.
    if (written === base) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!isSameCell) typingCellRef.current = { col, row, original: String(rows[row][field] ?? "") };
    next[row][field] = written;
    commitRows(next);
    event.preventDefault();
    event.stopPropagation();
  }

  function applyEdits(edits) {
    const next = rows.map((row) => ({ ...row }));
    const touchedItemNos = [];
    edits.forEach(({ location: [col, row], value }) => {
      const field = COLUMN_FIELDS[col];
      if (!field || !next[row]) return;
      next[row][field] = sanitizeField(field, value.data?.value ?? "");
      if (field === "itemNo") touchedItemNos.push(next[row].itemNo);
    });
    commitRows(next);
    resolve(touchedItemNos);
  }

  function resolve(itemNos) {
    const wanted = [...new Set(itemNos.map((itemNo) => String(itemNo ?? "").trim()).filter(Boolean))];
    if (wanted.length && onResolveItemNos) onResolveItemNos(wanted);
  }

  const ITEM_NO_COL = COLUMN_FIELDS.indexOf("itemNo");

  // glide never grows the grid for a pasted block taller than the rows that
  // exist - it silently drops the overflow - so the rows are extended first
  // and the values applied here, and glide is told not to run its own
  // (too-short) paste as well. This is the whole point of a grid here: a
  // whole issue list goes in with one Ctrl+V.
  function handlePaste([startCol, startRow], values) {
    const next = rows.map((row) => ({ ...row }));
    while (next.length < startRow + values.length) next.push(newWmsIssueRow());
    const pastedItemNos = [];
    values.forEach((rowValues, r) => {
      rowValues.forEach((value, c) => {
        const field = COLUMN_FIELDS[startCol + c];
        if (field) next[startRow + r][field] = sanitizeField(field, value ?? "");
      });
      const pastedItemNo = startCol <= ITEM_NO_COL && ITEM_NO_COL < startCol + rowValues.length;
      if (pastedItemNo) {
        // Whatever stood in the WMS-filled columns belonged to the item
        // number that was there before, so it is cleared - a row must never
        // show one material's number next to another's name while the new
        // lookup is in flight. **Only the columns this paste did not bring
        // itself**: a block pasted out of WMS's own export carries the name
        // alongside the number, and wiping that would blank the row until
        // the lookup answered.
        const pastedFields = rowValues.map((_, c) => COLUMN_FIELDS[startCol + c]);
        LOOKUP_FIELDS.filter((field) => !pastedFields.includes(field)).forEach((field) => {
          next[startRow + r][field] = "";
        });
        pastedItemNos.push(next[startRow + r].itemNo);
      }
    });
    commitRows(next);
    resolve(pastedItemNos);
    return false;
  }

  function handleDeleteSelected() {
    if (gridSelection.rows.length === 0) return;
    commitRows(rows.filter((_, index) => !gridSelection.rows.hasIndex(index)));
    setGridSelection({ columns: CompactSelection.empty(), rows: CompactSelection.empty() });
  }

  // Leaving an item-number cell resolves that row, the same moment
  // BulkReceiveGrid fills its name in. Reads rowsRef, not the prop: glide
  // can commit an edit and advance the selection in one tick (Tab out of an
  // open editor does exactly that), and commitRows has already written the
  // new value there.
  function handleGridSelectionChange(newSelection) {
    const prevCell = gridSelection.current?.cell;
    if (prevCell && COLUMN_FIELDS[prevCell[0]] === "itemNo") {
      const newCell = newSelection.current?.cell;
      const leftCell = !newCell || newCell[0] !== prevCell[0] || newCell[1] !== prevCell[1];
      const row = rowsRef.current[prevCell[1]];
      if (leftCell && row) resolve([row.itemNo]);
    }
    setGridSelection(newSelection);
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        style={{ height: gridHeight }}
        className="overflow-hidden rounded-lg border border-gray-200 dark:border-neutral-700"
      >
        {containerSize.width > 0 && (
          <DataEditor
            width={containerSize.width}
            height={gridHeight}
            columns={columns}
            getCellContent={getCellContent}
            customRenderers={[smTextCellRenderer]}
            rows={rows.length}
            onCellEdited={(cell, newValue) => applyEdits([{ location: cell, value: newValue }])}
            onCellsEdited={(newValues) => {
              applyEdits(newValues);
              return true;
            }}
            onPaste={handlePaste}
            onKeyDown={handleGridKeyDown}
            getCellsForSelection
            rangeSelect="rect"
            rowMarkers="checkbox"
            fillHandle
            // Both of these are this build's own quirks, documented at
            // length in BulkReceiveGrid: editOnType restarts the edit
            // session per keystroke, and glide's default activateCell
            // binding of " " swallows every space typed into a cell.
            editOnType={false}
            keybindings={{ activateCell: "Enter|shift+Enter" }}
            gridSelection={gridSelection}
            onGridSelectionChange={handleGridSelectionChange}
            theme={isDark ? DARK_THEME : LIGHT_THEME}
            smoothScrollX
            smoothScrollY
          />
        )}
      </div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onAddRow}
          className="text-sm font-medium text-navy-700 hover:underline dark:text-navy-300"
        >
          {t("grid.addRow")}
        </button>
        {gridSelection.rows.length > 0 && (
          <button
            type="button"
            onClick={handleDeleteSelected}
            className="flex items-center gap-1 text-sm font-medium text-red-600 hover:underline dark:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("grid.removeSelected", { count: gridSelection.rows.length })}
          </button>
        )}
      </div>
    </div>
  );
}
