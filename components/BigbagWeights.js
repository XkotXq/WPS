"use client";

import { useState } from "react";
import { Scale, X, Plus, ChevronUp } from "lucide-react";
import { bigbagCoverage, parseWeight } from "@/lib/bigbagWeights";

// Typing in the weights of the bigbags standing on the floor, for one jacket
// compound, on "Zamowienia -> Postep produkcji" - and reading off how many of
// them the day takes.
//
// Only the drawing is here. What the numbers mean, and where they are kept,
// is lib/bigbagWeights.js - the Excel export reads the same figures, and this
// screen's arithmetic should be checkable without a browser.

const kgFormat = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 });

const CHIP_CLS =
  "inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-1.5 py-0.5 dark:border-neutral-700 dark:bg-neutral-900";
const NUMBER_INPUT_CLS =
  "w-14 bg-transparent text-right text-[11px] tabular-nums text-gray-900 focus:outline-none dark:text-neutral-100";

export default function BigbagWeights({ item, weights, onChange, t }) {
  const list = weights ?? [];
  const [open, setOpen] = useState(false);
  const coverage = bigbagCoverage(list, item.needed);
  const weighedTotal = `${kgFormat.format(coverage.total)} ${item.unit}`;
  const weighed = `${t("bigbags", { count: list.length })} · ${weighedTotal}`;

  // Every change is sent as a function of the list as it is *then*, not of
  // the one this render saw: typing a weight and clicking an X commits the
  // typed one on the way out (blur fires before the click), so a handler
  // holding the pre-blur list would throw that bag away again.
  function commitAt(index, raw) {
    const weight = parseWeight(raw);
    // An emptied field takes that bag off the list: the field *is* the bag,
    // so clearing it is the obvious way to say it is gone.
    onChange(item.itemNo, (prev) =>
      weight === null ? prev.filter((_, i) => i !== index) : prev.map((w, i) => (i === index ? weight : w))
    );
  }

  function add(raw) {
    const weight = parseWeight(raw);
    if (weight === null) return false;
    onChange(item.itemNo, (prev) => [...prev, weight]);
    return true;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-gray-300 px-1.5 py-0.5 text-[11px] text-gray-500 transition-colors hover:border-navy-700 hover:text-navy-700 dark:border-neutral-600 dark:text-neutral-400 dark:hover:border-navy-400 dark:hover:text-navy-300"
      >
        <Scale className="h-3 w-3" />
        {list.length > 0 ? weighed : t("weights.open")}
      </button>
    );
  }

  return (
    <div className="w-full rounded-lg border border-gray-200 bg-gray-50/70 p-2.5 dark:border-neutral-700 dark:bg-neutral-800/40">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-neutral-500">
          {t("weights.title")}
        </span>
        <div className="flex items-center gap-3">
          {list.length > 0 && (
            <button
              type="button"
              onClick={() => onChange(item.itemNo, () => [])}
              className="text-[11px] text-gray-500 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400"
            >
              {t("weights.clear")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("weights.close")}
            title={t("weights.close")}
            className="text-gray-400 hover:text-navy-700 dark:text-neutral-500 dark:hover:text-navy-300"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {list.map((weight, index) => (
          <span key={`${index}:${weight}`} className={CHIP_CLS}>
            <input
              type="text"
              inputMode="decimal"
              defaultValue={weight}
              aria-label={`${t("weights.one")} ${index + 1} - ${item.name}`}
              onBlur={(event) => commitAt(index, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              className={NUMBER_INPUT_CLS}
            />
            <span className="text-[10px] text-gray-400 dark:text-neutral-500">{item.unit}</span>
            <button
              type="button"
              onClick={() => onChange(item.itemNo, (prev) => prev.filter((_, i) => i !== index))}
              aria-label={`${t("weights.remove")} ${index + 1}`}
              className="text-gray-300 transition-colors hover:text-red-600 dark:text-neutral-600 dark:hover:text-red-400"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        {/* One field that empties itself and keeps the focus: bags are weighed
            one after another, so a shelf goes in as "1012 ⏎ 987 ⏎ 1003 ⏎"
            without a hand leaving the keyboard. */}
        <span className={`${CHIP_CLS} border-dashed`}>
          <Plus className="h-3 w-3 text-gray-400 dark:text-neutral-500" />
          <input
            type="text"
            inputMode="decimal"
            placeholder={t("weights.one")}
            aria-label={`${t("weights.add")} - ${item.name}`}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              if (add(event.currentTarget.value)) event.currentTarget.value = "";
            }}
            onBlur={(event) => {
              if (add(event.target.value)) event.target.value = "";
            }}
            className={`${NUMBER_INPUT_CLS} placeholder:text-gray-400 dark:placeholder:text-neutral-600`}
          />
          <span className="text-[10px] text-gray-400 dark:text-neutral-500">{item.unit}</span>
        </span>
      </div>

      {/* The answer the weights are typed in for: how many of *these* bags
          today takes, or what they are short of. */}
      <p className="mt-2 text-[11px] tabular-nums">
        {list.length === 0 ? (
          <span className="text-gray-400 dark:text-neutral-500">{t("weights.none")}</span>
        ) : coverage.enough ? (
          <span className="text-emerald-600 dark:text-emerald-400">
            {t("weights.enough", {
              bags: t("bigbags", { count: coverage.used }),
              surplus: `${kgFormat.format(coverage.surplus)} ${item.unit}`,
            })}
          </span>
        ) : (
          <span className="text-amber-600 dark:text-amber-400">
            {t("weights.short", { short: `${kgFormat.format(coverage.short)} ${item.unit}` })}
          </span>
        )}
        {list.length > 0 && (
          <span className="ml-2 text-gray-400 dark:text-neutral-500">
            {t("weights.weighed", { bags: t("bigbags", { count: list.length }), weight: weighedTotal })}
          </span>
        )}
      </p>
    </div>
  );
}
