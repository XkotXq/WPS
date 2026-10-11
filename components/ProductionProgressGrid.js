"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { DataEditor, CompactSelection } from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { Trash2 } from "lucide-react";
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

// The input half of "Zamówienia → Postęp produkcji": the planners' list of
// what runs on which production line, pasted straight out of Excel into the
// same kind of grid "Przyjęcie zamówienia" uses (BulkReceiveGrid - this is
// the cut-down sibling of it, two columns and no catalog lookups).
//
// Two columns on purpose: the list is kept as line + number, and a grid is
// what makes a multi-row paste from Excel land in one go. The number column
// takes either a job number ("CF-260010303028101-544182") or a bare order
// number ("260010303028101") - the API decides which it is, so nothing here
// validates the shape beyond leaving whatever was typed alone.

const COLUMN_FIELDS = ["line", "number"];

// Over plain HTTP (the warehouse LAN) glide-data-grid's paste throws before
// it reaches its own event-based fallback - see the module for what this
// restores and why it is safe.
installInsecureClipboardFallback();

let progressRowSeq = 0;
export function newProgressRow() {
  progressRowSeq += 1;
  return { id: `progress-${progressRowSeq}`, line: "", number: "" };
}

function isRowEmpty(row) {
  return COLUMN_FIELDS.every((field) => !row[field]);
}

// Excel-style "always one spare row", so there is never nowhere to type the
// next position - the same rule BulkReceiveGrid follows, inside commitRows
// so every write path gets it.
function ensureSpareRow(rowsArr) {
  return rowsArr.some(isRowEmpty) ? rowsArr : [...rowsArr, newProgressRow()];
}

/**
 * The grid's rows as the text the API's own parser reads: one
 * `line<TAB>number` per filled row.
 *
 * Serialising rather than sending a structured list keeps **one** parser in
 * wpsApi for every way this screen can be filled - a two-column
 * tab-separated block is a shape it already handles and has assertions for,
 * so the grid needs no format of its own.
 */
export function progressRowsToText(rows) {
  return rows
    .filter((row) => String(row.number ?? "").trim())
    .map((row) => `${String(row.line ?? "").trim()}\t${String(row.number ?? "").trim()}`)
    .join("\n");
}

export default function ProductionProgressGrid({ rows, onChange, onAddRow, t }) {
  const isDark = useIsDarkMode();
  const [containerRef, containerSize] = useElementSize();
  const [gridSelection, setGridSelection] = useState({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });
  const gridHeight = gridHeightFor(rows.length);

  // Mirrors `rows` but written synchronously, so a handler that fires in
  // the same tick as a commit never reads a stale pre-edit snapshot - see
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
      { title: t("grid.line"), id: "line", width: 110 },
      { title: t("grid.number"), id: "number", width: 280, grow: 1 },
    ],
    [t]
  );

  const getCellContent = useCallback(
    ([col, row]) => {
      const field = COLUMN_FIELDS[col];
      const rowData = rows[row];
      const value = rowData?.[field] ?? "";
      // A row with a number but no line still works (it inherits nothing -
      // the API groups it under "Bez linii"), so the only thing marked is a
      // row somebody started and left without the number that makes it
      // lookupable.
      const started = rowData && COLUMN_FIELDS.some((f) => String(rowData[f] ?? "").trim());
      const missing = started && field === "number" && !String(value).trim();
      return makeTextCell(value, missing);
    },
    [rows]
  );

  // Type straight over a selected cell, Excel-style. Handled here rather
  // than through glide's own editOnType, which in this build restarts the
  // edit session on every keystroke - see BulkReceiveGrid for the detail.
  const typingCellRef = useRef(null);

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
    if (!isSameCell) typingCellRef.current = { col, row, original: rows[row][field] ?? "" };
    next[row][field] = (isSameCell ? String(rows[row][field] ?? "") : "") + event.key;
    commitRows(next);
    event.preventDefault();
    event.stopPropagation();
  }

  function applyEdits(edits) {
    const next = rows.map((row) => ({ ...row }));
    edits.forEach(({ location: [col, row], value }) => {
      const field = COLUMN_FIELDS[col];
      if (field && next[row]) next[row][field] = value.data?.value ?? "";
    });
    commitRows(next);
  }

  // glide never grows the grid for a pasted block taller than the rows that
  // exist - it silently drops the overflow - so the rows are extended first
  // and the values applied here, and glide is told not to run its own
  // (too-short) paste as well. This is the whole point of using a grid for
  // this screen: a shift's list goes in with one Ctrl+V.
  function handlePaste([startCol, startRow], values) {
    const next = rows.map((row) => ({ ...row }));
    while (next.length < startRow + values.length) next.push(newProgressRow());
    values.forEach((rowValues, r) => {
      rowValues.forEach((value, c) => {
        const field = COLUMN_FIELDS[startCol + c];
        if (field) next[startRow + r][field] = value ?? "";
      });
    });
    commitRows(next);
    return false;
  }

  function handleDeleteSelected() {
    if (gridSelection.rows.length === 0) return;
    commitRows(rows.filter((_, index) => !gridSelection.rows.hasIndex(index)));
    setGridSelection({ columns: CompactSelection.empty(), rows: CompactSelection.empty() });
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
            onGridSelectionChange={setGridSelection}
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
          {t("addRow")}
        </button>
        {gridSelection.rows.length > 0 && (
          <button
            type="button"
            onClick={handleDeleteSelected}
            className="flex items-center gap-1 text-sm font-medium text-red-600 hover:underline dark:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("removeSelected", { count: gridSelection.rows.length })}
          </button>
        )}
      </div>
    </div>
  );
}
