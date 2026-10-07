"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/// Up/down arrows through a suggestion list under an input, with Enter to
/// pick the highlighted one and Escape to give up.
///
/// One hook rather than the same dozen lines in every dropdown: wps has
/// several (places, materials on a new order, the guidelines picker, the nav
/// search) and they were drifting - some had no keyboard handling at all, so
/// the list could only be used with the mouse.
///
/// [length] is the **flat** number of options, so a list split into groups
/// (the new-order item picker has "on this order" and "everything else")
/// still walks top to bottom as one sequence; the caller maps the index back
/// to its own groups.
///
/// With nothing highlighted, down takes the first option and up the last,
/// and Enter takes the first - which is what makes typing-then-Enter work
/// without touching the arrows at all. No wrap-around: a list that jumps
/// back to the top when you hold the key down is hard to aim.
///
/// Attach [registerRow] to every option (`ref={(el) => keys.registerRow(i, el)}`)
/// and the highlighted one is kept in view: these lists are capped at
/// `max-h-56` and scroll, so arrowing past the bottom used to move an
/// invisible highlight - the list stayed put and nothing looked selected.
export function useListKeyboard({ length, onPick, onEscape }) {
  const [index, setIndex] = useState(-1);
  const rows = useRef(new Map());

  const registerRow = useCallback((i, el) => {
    if (el) rows.current.set(i, el);
    else rows.current.delete(i);
  }, []);

  // `block: "nearest"` scrolls the least that works and does nothing when
  // the row is already visible - so moving the highlight inside the visible
  // part of the list never jumps the view, and the page behind the dropdown
  // is left alone.
  useEffect(() => {
    if (index < 0) return;
    rows.current.get(index)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [index]);

  // The options change as the query is typed, and a highlight left on
  // position 4 of a list that now has two entries would pick the wrong one.
  useEffect(() => {
    setIndex(-1);
    rows.current.clear();
  }, [length]);

  const onKeyDown = useCallback(
    (event) => {
      if (event.key === "Escape") {
        setIndex(-1);
        onEscape?.();
        return;
      }
      if (!length) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const down = event.key === "ArrowDown";
        setIndex((prev) => {
          if (prev === -1) return down ? 0 : length - 1;
          return Math.min(Math.max(prev + (down ? 1 : -1), 0), length - 1);
        });
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        onPick(index >= 0 ? index : 0);
      }
    },
    [length, index, onPick, onEscape]
  );

  return { index, setIndex, onKeyDown, registerRow };
}

/// The highlight for row [i] - same look as a hover, so arrowing down and
/// moving the mouse feel like the same thing.
export function listRowClasses(active) {
  return active ? "bg-navy-50 dark:bg-neutral-800" : "hover:bg-gray-50 dark:hover:bg-neutral-800";
}
