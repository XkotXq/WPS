"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DataEditor, CompactSelection, GridCellKind } from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { Trash2 } from "lucide-react";

// Column order fixed here - getCellContent/applyEdits both index into a row
// object by this same array, so adding/reordering a column only ever
// needs a change in one place.
const COLUMN_FIELDS = ["itemNo", "itemName", "quantity", "location", "unitId"];

// Shared with SmMaterialsPanel.js (which seeds the initial 3 rows and
// appends one per "Dodaj wiersz" click) so there is one row shape/id
// sequence, not two - also what onPaste below grows the array with when a
// pasted block covers more rows than currently exist.
let bulkRowSeq = 0;
export function newBulkReceiveRow() {
  bulkRowSeq += 1;
  return { id: `bulk-${bulkRowSeq}`, itemNo: "", itemName: "", quantity: "", location: "", unitId: "" };
}

// glide-data-grid's own built-in text-cell editor (a "growing-entry"
// input it mounts/positions/paints itself) is unreliable in this alpha -
// besides the known editOnType bug below, its overlay can render behind
// the grid's own <canvas> so typed text is invisible until the edit
// commits (fixed for the *default* editor with a z-index override in
// globals.css, but still flaky on individual keystrokes). A custom cell
// (GridCellKind.Custom + this renderer's own provideEditor) sidesteps all
// of that: the editor below is a plain controlled <input> we render and
// own completely, so nothing about its visibility or keystroke handling
// depends on glide's internals - only its *positioning* (via `target`)
// and commit/cancel plumbing (onFinishedEditing) still come from glide.
const SM_TEXT_CELL_KIND = "sm-text-cell";

function makeTextCell(value) {
  return { kind: GridCellKind.Custom, allowOverlay: true, copyData: value, data: { kind: SM_TEXT_CELL_KIND, value } };
}

function SmTextCellEditor({ value, onChange, onFinishedEditing }) {
  const [text, setText] = useState(value.data.value ?? "");
  return (
    <input
      autoFocus
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(makeTextCell(e.target.value));
      }}
      onBlur={() => onFinishedEditing(makeTextCell(text))}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onFinishedEditing(undefined);
        }
      }}
      className="h-full w-full border-none bg-white px-2 text-sm text-gray-900 outline-none dark:bg-neutral-900 dark:text-neutral-100"
    />
  );
}

const smTextCellRenderer = {
  kind: GridCellKind.Custom,
  isMatch: (cell) => cell.data?.kind === SM_TEXT_CELL_KIND,
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
    ctx.fillStyle = theme.textDark;
    ctx.font = theme.baseFontFull;
    ctx.textBaseline = "middle";
    ctx.fillText(cell.data.value ?? "", rect.x + theme.cellHorizontalPadding, rect.y + rect.height / 2 + 1);
    ctx.restore();
    return true;
  },
  provideEditor: () => ({ editor: SmTextCellEditor, disablePadding: true }),
  onPaste: (value) => ({ kind: SM_TEXT_CELL_KIND, value }),
  onDelete: (cell) => makeTextCell(""),
};

// This app's dark mode is a plain "dark" class toggled on <html> (see
// app/theme-provider.js) - watching it directly here is simpler than
// wiring a new context value through for just this one grid.
function useIsDarkMode() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setIsDark(root.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

// DataEditor's own position math for the cell overlay editor divides by
// this width to compute a canvas-to-CSS-pixel scale factor - if it
// doesn't match the container's *actual* rendered width exactly, that
// scale is wrong and the editor overlay lands nowhere near the cell it's
// supposed to edit (confirmed: without this, it rendered far below the
// viewport instead of over the clicked cell). Measuring the real
// container size with ResizeObserver and feeding it straight back in as
// explicit width/height keeps that scale at 1.
function useElementSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentBoxSize?.[0];
      setSize(box ? { width: box.inlineSize, height: box.blockSize } : { width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

// glide-data-grid renders to <canvas>, so theming is a plain JS object
// (Partial<Theme>) merged over its own defaults, not Tailwind classes -
// only the properties that actually differ from the light default need
// overriding here. accentColor matches the app's own navy ring/accent
// (see --color-navy-700/--color-navy-400 in app/globals.css); the dark
// palette mirrors this app's neutral-800/900 surfaces.
const LIGHT_THEME = { accentColor: "#22406e", linkColor: "#22406e" };
const DARK_THEME = {
  accentColor: "#7495d6",
  accentFg: "#ffffff",
  linkColor: "#7495d6",
  textDark: "#e5e5e5",
  textMedium: "#a3a3a3",
  textLight: "#737373",
  textHeader: "#d4d4d4",
  textHeaderSelected: "#ffffff",
  bgCell: "#171717",
  bgCellMedium: "#1f1f1f",
  bgHeader: "#262626",
  bgHeaderHasFocus: "#2b2b2b",
  bgHeaderHovered: "#2b2b2b",
  bgBubble: "#262626",
  bgBubbleSelected: "#333333",
  bgIconHeader: "#a3a3a3",
  fgIconHeader: "#171717",
  borderColor: "rgba(255,255,255,0.15)",
  horizontalBorderColor: "rgba(255,255,255,0.15)",
};

// Controlled - SmMaterialsPanel's ReceiveUnitPanel owns `rows` (and the id
// sequence used to create them) so import-from-file can seed the same
// state the grid edits, rather than this component having two different
// ways rows come into existence. Unlike the AG Grid Community version
// this replaced, glide-data-grid (MIT, no Enterprise tier) supports
// multi-cell range copy/paste from Excel natively - onPaste/onCellsEdited
// below is what makes a whole pasted block land in one go instead of only
// ever filling whichever single cell is focused.
//
// Height tracks the actual row count (glide's own defaults: 34px/row, 36px
// header) instead of a fixed box, capped at MAX_VISIBLE_ROWS - a fixed
// height taller than the real rows drew empty grid lines below them that
// looked like additional (nonexistent) rows; past the cap it still scrolls
// internally like before.
const ROW_HEIGHT = 34;
const HEADER_HEIGHT = 36;
const MAX_VISIBLE_ROWS = 10;

export default function BulkReceiveGrid({ rows, onChange, onAddRow, t }) {
  const isDark = useIsDarkMode();
  const [containerRef, containerSize] = useElementSize();
  const [gridSelection, setGridSelection] = useState({ columns: CompactSelection.empty(), rows: CompactSelection.empty() });
  const gridHeight = HEADER_HEIGHT + Math.min(Math.max(rows.length, 1), MAX_VISIBLE_ROWS) * ROW_HEIGHT;

  const columns = useMemo(
    () => [
      { title: t("columns.itemNo"), id: "itemNo", width: 150 },
      { title: t("columns.itemName"), id: "itemName", width: 220, grow: 1 },
      { title: t("columns.quantity"), id: "quantity", width: 90 },
      { title: t("columns.location"), id: "location", width: 100 },
      { title: t("columns.unitId"), id: "unitId", width: 130 },
    ],
    [t]
  );

  const getCellContent = useCallback(
    ([col, row]) => makeTextCell(rows[row]?.[COLUMN_FIELDS[col]] ?? ""),
    [rows]
  );

  // Excel-style "just start typing over a selected cell" - editOnType
  // can't be used for this (see its own comment further down: this alpha
  // build restarts/loses the edit session on every keystroke when it
  // drives the activation itself). Handling it here sidesteps that
  // entirely: a printable key writes straight into `rows`, so the custom
  // cell's own canvas draw shows it live with no overlay editor involved
  // at all. `typingCellRef` remembers which cell + pre-typing value the
  // current run of keystrokes belongs to, so the first keystroke on a
  // freshly selected cell replaces its content (like Excel) while the
  // next ones on that same cell keep appending, and Escape can restore
  // what was there before.
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
      onChange(next);
      typingCellRef.current = null;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.key === "Backspace" && isSameCell) {
      const next = rows.map((r) => ({ ...r }));
      next[row][field] = rows[row][field].slice(0, -1);
      onChange(next);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.key.length !== 1 || event.ctrlKey || event.metaKey) return;

    const next = rows.map((r) => ({ ...r }));
    if (isSameCell) {
      next[row][field] = rows[row][field] + event.key;
    } else {
      typingCellRef.current = { col, row, original: rows[row][field] };
      next[row][field] = event.key;
    }
    onChange(next);
    event.preventDefault();
    event.stopPropagation();
  }

  // Shared by a single edit (onCellEdited) and a pasted block of many at
  // once (onCellsEdited) - both just resolve to a list of {location,
  // value} pairs applied to one copy of the rows array.
  function applyEdits(edits) {
    const next = rows.map((row) => ({ ...row }));
    edits.forEach(({ location: [col, row], value }) => {
      const field = COLUMN_FIELDS[col];
      if (field && next[row]) next[row][field] = value.data?.value ?? "";
    });
    onChange(next);
  }

  // glide-data-grid never grows the grid on its own when a pasted block
  // covers more rows than currently exist - it silently drops whatever
  // doesn't fit an existing row (see its own onPaste doc comment: "advisable
  // to simply return false ... and handle the paste manually"). Handling it
  // here instead: extend `rows` first so every pasted row has somewhere to
  // land, then apply the values directly and tell glide not to also run its
  // own (now-redundant, and too-short) default paste.
  function handlePaste([startCol, startRow], values) {
    const next = rows.map((row) => ({ ...row }));
    while (next.length < startRow + values.length) next.push(newBulkReceiveRow());
    values.forEach((rowValues, r) => {
      rowValues.forEach((value, c) => {
        const field = COLUMN_FIELDS[startCol + c];
        if (field) next[startRow + r][field] = value ?? "";
      });
    });
    onChange(next);
    return false;
  }

  function handleDeleteSelected() {
    if (gridSelection.rows.length === 0) return;
    onChange(rows.filter((_, index) => !gridSelection.rows.hasIndex(index)));
    setGridSelection({ columns: CompactSelection.empty(), rows: CompactSelection.empty() });
  }

  return (
    <div className="flex flex-col gap-2">
      {/* A plain computed height, not flex-1 - this sits inside
        DialogContent's own flex column, which shrinks to fit its (small)
        content rather than stretching to the dialog's max-h-[85vh], so
        there is no real leftover space for flex-grow to hand out. */}
      <div ref={containerRef} style={{ height: gridHeight }} className="overflow-hidden rounded-lg border border-gray-200 dark:border-neutral-700">
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
          // Drag the little handle at the bottom-right corner of a
          // selection to repeat that cell's (or range's) value down/across
          // - goes through the same onCellsEdited path as a pasted block.
          fillHandle
          // Confirmed this alpha build's editOnType path itself restarts
          // the whole edit session (remounting whichever editor is
          // active, ours included) on every keystroke typed directly over
          // a selected cell - the bug is in glide's own activation logic,
          // not the built-in text editor SmTextCellEditor replaces, so a
          // custom editor doesn't fix this specific path. Double-click or
          // Enter to open a cell for editing isn't affected.
          editOnType={false}
          gridSelection={gridSelection}
          onGridSelectionChange={setGridSelection}
          theme={isDark ? DARK_THEME : LIGHT_THEME}
          smoothScrollX
          smoothScrollY
        />
        )}
      </div>
      <div className="flex items-center gap-4">
        <button type="button" onClick={onAddRow} className="text-sm font-medium text-navy-700 hover:underline dark:text-navy-300">
          {t("receivePanel.addRow")}
        </button>
        {gridSelection.rows.length > 0 && (
          <button
            type="button"
            onClick={handleDeleteSelected}
            className="flex items-center gap-1 text-sm font-medium text-red-600 hover:underline dark:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("receivePanel.removeSelected", { count: gridSelection.rows.length })}
          </button>
        )}
      </div>
    </div>
  );
}
