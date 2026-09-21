"use client";

import { useEffect, useRef, useState } from "react";
import { GridCellKind } from "@glideapps/glide-data-grid";

// Shared glide-data-grid scaffolding for every "Excel-like paste a table"
// grid in this app (BulkReceiveGrid.js) - one place
// for the workarounds this alpha build needs, instead of copying
// the same bug fixes into each grid by hand.

export const SM_TEXT_CELL_KIND = "sm-text-cell";

// glide-data-grid's own built-in text-cell editor (a "growing-entry"
// input it mounts/positions/paints itself) is unreliable in this alpha -
// besides the known editOnType bug callers work around with their own
// onKeyDown handler, its overlay can render behind the grid's own
// <canvas> so typed text is invisible until the edit commits (fixed for
// the *default* editor with a z-index override in globals.css, but still
// flaky on individual keystrokes). A custom cell (GridCellKind.Custom +
// this renderer's own provideEditor) sidesteps all of that: the editor
// below is a plain controlled <input> we render and own completely,
// nothing about its visibility or keystroke handling depends on glide's
// internals - only its *positioning* (via `target`) and commit/cancel
// plumbing (onFinishedEditing) still come from glide.
export function makeTextCell(value, invalid = false) {
  return { kind: GridCellKind.Custom, allowOverlay: true, copyData: value, data: { kind: SM_TEXT_CELL_KIND, value, invalid } };
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

export const smTextCellRenderer = {
  kind: GridCellKind.Custom,
  isMatch: (cell) => cell.data?.kind === SM_TEXT_CELL_KIND,
  draw: (args, cell) => {
    const { ctx, rect, theme } = args;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
    ctx.clip();
    if (cell.data.invalid) {
      // Inset by 1px so this fill never touches the cell's own border line -
      // glide draws that border (a translucent gray, see its default
      // borderColor) *after* this custom cell renders, so painting flush to
      // the edge let the red show through the border itself, making it read
      // as a red outline around the cell rather than just an interior
      // highlight.
      ctx.fillStyle = "rgba(220, 38, 38, 0.16)";
      ctx.fillRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
    }
    ctx.fillStyle = theme.textDark;
    ctx.font = theme.baseFontFull;
    ctx.textBaseline = "middle";
    ctx.fillText(cell.data.value ?? "", rect.x + theme.cellHorizontalPadding, rect.y + rect.height / 2 + 1);
    ctx.restore();
    return true;
  },
  provideEditor: () => ({ editor: SmTextCellEditor, disablePadding: true }),
  onPaste: (value) => ({ kind: SM_TEXT_CELL_KIND, value }),
  onDelete: () => makeTextCell(""),
};

// This app's dark mode is a plain "dark" class toggled on <html> (see
// app/theme-provider.js) - watching it directly here is simpler than
// wiring a new context value through for just these grids.
export function useIsDarkMode() {
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
// supposed to edit. Measuring the real container size with ResizeObserver
// and feeding it straight back in as explicit width/height keeps that
// scale at 1.
export function useElementSize() {
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
export const LIGHT_THEME = { accentColor: "#22406e", linkColor: "#22406e" };
export const DARK_THEME = {
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

// Height tracks the actual row count (glide's own defaults: 34px/row, 36px
// header) instead of a fixed box, capped at MAX_VISIBLE_ROWS - a fixed
// height taller than the real rows drew empty grid lines below them that
// looked like additional (nonexistent) rows; past the cap it still scrolls
// internally like before. +2px slack: glide's own internal scroller div
// lands ~1-2px shorter than its scrollHeight due to subpixel rounding, so
// an exact rows*ROW_HEIGHT match still triggers a vertical scrollbar on a
// grid that isn't actually scrolled.
export const ROW_HEIGHT = 34;
export const HEADER_HEIGHT = 36;
export const MAX_VISIBLE_ROWS = 10;
export function gridHeightFor(rowCount) {
  return HEADER_HEIGHT + Math.min(Math.max(rowCount, 1), MAX_VISIBLE_ROWS) * ROW_HEIGHT + 2;
}
