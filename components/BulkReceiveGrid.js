"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DataEditor, CompactSelection, GridCellKind } from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { Trash2 } from "lucide-react";

// Column order fixed here - getCellContent/applyEdits both index into a row
// object by this same array, so adding/reordering a column only ever
// needs a change in one place.
const COLUMN_FIELDS = ["itemNo", "itemName", "quantity", "location", "unitId"];

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
const GRID_HEIGHT = 260;

export default function BulkReceiveGrid({ rows, onChange, onAddRow, t }) {
  const isDark = useIsDarkMode();
  const [containerRef, containerSize] = useElementSize();
  const [gridSelection, setGridSelection] = useState({ columns: CompactSelection.empty(), rows: CompactSelection.empty() });

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
    ([col, row]) => {
      const value = rows[row]?.[COLUMN_FIELDS[col]] ?? "";
      return { kind: GridCellKind.Text, data: value, displayData: value, allowOverlay: true };
    },
    [rows]
  );

  // Shared by a single edit (onCellEdited) and a pasted block of many at
  // once (onCellsEdited) - both just resolve to a list of {location,
  // value} pairs applied to one copy of the rows array.
  function applyEdits(edits) {
    const next = rows.map((row) => ({ ...row }));
    edits.forEach(({ location: [col, row], value }) => {
      const field = COLUMN_FIELDS[col];
      if (field && next[row]) next[row][field] = value.data ?? "";
    });
    onChange(next);
  }

  function handleDeleteSelected() {
    if (gridSelection.rows.length === 0) return;
    onChange(rows.filter((_, index) => !gridSelection.rows.hasIndex(index)));
    setGridSelection({ columns: CompactSelection.empty(), rows: CompactSelection.empty() });
  }

  return (
    <div className="flex flex-col gap-2">
      {/* A plain fixed height, not flex-1 - this sits inside DialogContent's
        own flex column, which shrinks to fit its (small) content rather
        than stretching to the dialog's max-h-[85vh], so there is no real
        leftover space for flex-grow to hand out. */}
      <div ref={containerRef} style={{ height: GRID_HEIGHT }} className="overflow-hidden rounded-lg border border-gray-200 dark:border-neutral-700">
        {containerSize.width > 0 && (
        <DataEditor
          width={containerSize.width}
          height={GRID_HEIGHT}
          columns={columns}
          getCellContent={getCellContent}
          rows={rows.length}
          onCellEdited={(cell, newValue) => applyEdits([{ location: cell, value: newValue }])}
          onCellsEdited={(newValues) => {
            applyEdits(newValues);
            return true;
          }}
          onPaste
          getCellsForSelection
          rangeSelect="rect"
          rowMarkers="checkbox"
          // Alpha build bug (this is the only glide-data-grid release
          // that supports React 19): typing directly over a selected cell
          // restarts editing from scratch on every keystroke, so only the
          // last character sticks. Double-click or Enter to open a cell
          // for editing isn't affected - disabling type-to-edit avoids
          // the buggy path entirely while keeping normal typing once a
          // cell is actually open.
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
