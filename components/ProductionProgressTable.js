"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Columns3, Download } from "lucide-react";
import { fetchProductionProgress } from "@/lib/productionProgressApi";
import ProductionProgressGrid, { newProgressRow, progressRowsToText } from "@/components/ProductionProgressGrid";
import BigbagWeights from "@/components/BigbagWeights";
import { readStoredBigbagWeights, storeBigbagWeights, bigbagCoverage } from "@/lib/bigbagWeights";
import { downloadProductionProgress } from "@/lib/productionProgressExport";
import { lineMaterials } from "@/lib/lineMaterials";

// "Zamówienia → Postęp produkcji": the planners' list of what runs on which
// production line, pasted in, answered per position with the length of the
// run and how much of it is still to be made.
//
// Read-only and not stored anywhere - every check is live against CIP (see
// wpsApi's src/productionProgress.js, which also owns the parsing of the
// pasted text, so this screen never has its own idea of the format).
//
// Grouped by line, in the order it was pasted, because that is the shape the
// list is kept and read in: the question being asked is "what is left on
// ST03", not "what is left on position 544069".

// Where the typed-in package sizes are remembered. Per browser on
// purpose - one person's note about the rolls and bags currently on the
// shelf. Every read and write is guarded: a private window, blocked site
// data or a half-written value must cost the default size, never the
// screen.
const SIZES_KEY = "wps.productionProgress.packageSizes";

function readStoredPackageSizes() {
  try {
    const raw = window.localStorage.getItem(SIZES_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};
    // Only usable numbers survive the trip back, same rule as wpsApi's own
    // sanitisePackageSizes - the API drops the rest anyway, this just keeps
    // the inputs from showing a value that will not be used.
    return Object.fromEntries(
      Object.entries(parsed).filter(([, size]) => Number.isFinite(Number(size)) && Number(size) > 0)
    );
  } catch {
    return {};
  }
}

function storePackageSizes(sizes) {
  try {
    window.localStorage.setItem(SIZES_KEY, JSON.stringify(sizes));
  } catch {
    // Nothing to do and nothing worth saying: the size still applies to
    // this result, it just will not be remembered for next time.
  }
}

const HEAD_CLS = "text-[11px] font-medium tracking-wide text-gray-400 dark:text-neutral-500";
const CELL_CLS = "text-gray-600 dark:text-neutral-300";
const NUM_CLS = "text-right tabular-nums";

// What a material group is called on the floor. The API keys are internal
// ("jacket" covers both PE and LSZH, which is one job done by two
// compounds, and "tube" the PBT the tubes are extruded from); these are the
// names people actually use, and they read the same in both languages so
// they are not translations.
const MATERIAL_LABELS = { frp: "FRP", tube: "PBTP", jacket: "PE / LSZH" };
// The order material groups are listed in, inside a stage cell - the same
// order the API sends them in.
const MATERIAL_GROUP_ORDER = ["frp", "tube", "jacket"];

// The groups that come in countable packages, and the word for one: FRP on
// rolls, jacket compound in bigbags. The API decides how many (packagesForDay
// in wpsApi's productionProgress.js - a day's capacity per line, and a
// package two parallel machines cannot share); this only names them. A group
// the API counts nothing for simply has no panel.
// `weights` is the one difference beyond the wording: a bigbag is weighed and
// no two come out the same, so that panel also takes the weights of the bags
// on the floor and says how many of *those* the day takes (see
// components/BigbagWeights.js). A roll is sold by the length printed on it,
// so there is nothing to weigh there.
const PACKAGE_PANELS = [
  { key: "frp", heading: "frpForDay", count: "rolls" },
  { key: "tube", heading: "tubeForDay", count: "bigbags", weights: true },
  { key: "jacket", heading: "jacketForDay", count: "bigbags", weights: true },
];
const materialLabel = (key) => MATERIAL_LABELS[key] ?? key.toUpperCase();


const kmFormat = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 3 });
const pctFormat = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 });
// Per-kilometre consumption runs small for masterbatch and colourants
// (hundredths of a kg), so it gets more places than the quantities do.
const perKmFormat = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 4 });

function Bar({ percent }) {
  const done = percent >= 100;
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-neutral-800">
      <div
        className={`h-full rounded-full ${done ? "bg-emerald-500" : "bg-navy-700 dark:bg-navy-400"}`}
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </div>
  );
}

// One process stage: what is still to run, and what it is out of.
//
// **The two numbers are in that stage's own unit, not kilometres of cable**
// (see wpsApi's stageFigures). Stranding is the clear case - a 44 km run
// reports 264 there, because it strands six elements along it - so the
// "z ..." figure is the stage's own planned amount and the column is only
// ever read down its own length, never across to another stage.
//
// A stage with nothing left shows a plain 0 in green: on a screen read for
// what is still to do, "0" is the answer, and the colour is what makes it
// findable at a glance.
function ProcessCell({ figures, materials, showPerKm, t }) {
  const items = materials ?? figures?.materials;
  if (!figures) {
    // CIP reports nothing on this stage. The materials are still what has
    // to reach the line, so the plain view keeps them instead of printing a
    // bare dash - the other half of why FRP could go missing there.
    if (!items) return <span className="text-gray-400 dark:text-neutral-500">—</span>;
    return (
      <div className="min-w-[72px]">
        <span className="text-gray-400 dark:text-neutral-500">—</span>
        <StageMaterials materials={items} showPerKm={showPerKm} />
      </div>
    );
  }

  const done = figures.remaining === 0;
  return (
    <div
      className="min-w-[72px]"
      title={figures.percent === null ? undefined : `${pctFormat.format(figures.percent)}%`}
    >
      <div
        className={`text-sm font-semibold tabular-nums ${
          done ? "text-emerald-600 dark:text-emerald-400" : "text-navy-950 dark:text-white"
        }`}
      >
        {kmFormat.format(figures.remaining)}
        {/* Only where the stage really is counted in the cable own
            kilometres - SC is not (see wpsApi inRunKm). */}
        {figures.inRunKm && <span className="ml-1 text-[11px] font-normal text-gray-500 dark:text-neutral-400">km</span>}
      </div>
      <div className="text-[11px] tabular-nums text-gray-500 dark:text-neutral-400">
        {t("processOf", { total: kmFormat.format(figures.planned) })}
      </div>
      {figures.percent !== null && (
        <div className="mt-1">
          <Bar percent={figures.percent} />
        </div>
      )}
      {/* The materials this stage consumes, from CIP's own BOM - each with
          what is still to issue for the part of the stage still to run.
          They sit inside the stage rather than in a column of their own
          because that is where the work is: FRP goes in at stranding, the
          jacket at sheathing, and the amounts differ by how far each stage
          has got.

          `materials` overrides that for the plain view, which shows one
          stage per line and would otherwise hide every material filed
          under a different one - see the lineProcess cell. */}
      <StageMaterials materials={items} showPerKm={showPerKm} />
    </div>
  );
}

// Every material of a stage, in group order (FRP first, then the jacket
// compound), with the amount still needed in its own catalog unit - km for
// FRP, kg for a jacket compound.
function StageMaterials({ materials, showPerKm }) {
  if (!materials) return null;
  const items = MATERIAL_GROUP_ORDER.flatMap((key) => materials[key] ?? []);
  if (!items.length) return null;

  return (
    <div className="mt-1.5 space-y-0.5 border-t border-gray-100 pt-1.5 dark:border-neutral-800">
      {items.map((item) => (
        <div key={item.itemNo} className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[11px] text-gray-600 dark:text-neutral-300" title={item.name}>
            {item.name}
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-[11px] font-medium tabular-nums text-gray-900 dark:text-neutral-100">
              {item.remainingQuantity === null ? "—" : `${kmFormat.format(item.remainingQuantity)} ${item.unit}`}
            </span>
            {/* What one kilometre of this cable takes - the figure you
                multiply by to plan, as opposed to what is left right now. */}
            {showPerKm && item.perKm !== null && (
              <span className="block text-[10px] tabular-nums text-gray-400 dark:text-neutral-500">
                {`${perKmFormat.format(item.perKm)} ${item.unit}/km`}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

// How much one roll/bigbag of this material holds. Uncommitted while it is
// being typed and sent on blur or Enter, because committing means another
// request (the API does the counting - see wpsApi's PACKAGE_RULES). Keyed by
// the size the answer came back with, so when a recount echoes a different
// one the field follows it instead of keeping a stale edit.
function PackageSizeInput({ item, onCommit, t }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <input
        key={`${item.itemNo}:${item.packageSize}`}
        type="text"
        inputMode="decimal"
        defaultValue={item.packageSize}
        aria-label={`${t("packageSize")} - ${item.name}`}
        title={t("packageSize")}
        onBlur={(event) => onCommit(item.itemNo, event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="w-16 rounded-md border border-gray-200 bg-transparent px-1.5 py-0.5 text-right text-[11px] tabular-nums text-gray-600 focus:border-navy-700 focus:outline-none dark:border-neutral-700 dark:text-neutral-300 dark:focus:border-navy-400"
      />
      <span className="text-[10px] text-gray-400 dark:text-neutral-500">{`${item.unit}/${t("perPackage")}`}</span>
    </span>
  );
}

// On how many production lines the day needs this material, with their
// names on hover. The API's own count (`lineCount`), not `lines.length`:
// what counts as needing it is its rule.
//
// Picked out in colour from two upwards, for the reason `OrderLines` is:
// "this one goes to four machines" is a different morning to plan than the
// same kilograms on one, whether or not it is also more packages - a
// pooled bigbag is one count for the day and can still have to be carried
// to four places.
function MaterialLines({ item, t }) {
  const count = item.lineCount ?? item.lines?.length ?? 0;
  if (!count) return null;
  const several = count > 1;
  return (
    <span
      title={(item.lines ?? []).map((line) => line.line).join(", ")}
      className={`text-[11px] tabular-nums ${
        several ? "font-medium text-navy-700 dark:text-navy-300" : "font-normal text-gray-400 dark:text-neutral-500"
      }`}
    >
      {t("onLines", { count })}
    </span>
  );
}

/**
 * One material on a package panel: how many packages the day takes of it, how
 * much that is, on how many lines it is needed, what one kilometre of cable
 * takes - and, for a bigbag, the weights of the bags on the floor.
 *
 * Exported because it is the whole of what those panels are, and a panel with
 * fixture data is the only way to look at this part of the screen without a
 * real production list and a CIP session behind it.
 */
export function PackageItemRow({ item, countKey, weighable, weights, onWeightsChange, onSizeCommit, t }) {
  // Where the bags have been weighed, the count that leads is the one made of
  // **those** bags: a 1250 kg bag and a 480 kg bag are not two of anything,
  // and it is bags that get carried. The API's nominal count stays beside it
  // whenever the two differ, so neither figure is a surprise. Bags short of
  // the day are the one case the weights cannot answer - nobody has weighed
  // the ones still to come - so there the nominal count leads.
  const list = weights ?? [];
  const cover = list.length > 0 ? bigbagCoverage(list, item.needed) : null;
  const byWeight = cover?.enough ? cover.used : null;

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="text-lg font-semibold tabular-nums text-navy-950 dark:text-white">
        {t(countKey, { count: byWeight ?? item.packages })}
      </span>
      {byWeight !== null && byWeight !== item.packages && (
        <span className="text-[11px] tabular-nums text-gray-400 dark:text-neutral-500">
          {t("weights.nominally", { bags: t(countKey, { count: item.packages }) })}
        </span>
      )}
      <span className="text-sm text-gray-600 dark:text-neutral-300">{item.name}</span>
      <MaterialLines item={item} t={t} />
      <span className="text-xs tabular-nums text-gray-500 dark:text-neutral-400">
        {kmFormat.format(item.needed)} {item.unit}
      </span>
      {/* What one kilometre of cable takes of it - the figure you multiply by
          to plan, as against the day's amount, which is only this shift's.
          The API's own and weighted by the cable it came from: the same
          compound runs at a different rate under every cable. */}
      {item.perKm !== null && item.perKm !== undefined && (
        <span className="text-[11px] tabular-nums text-gray-500 dark:text-neutral-400">
          {`${perKmFormat.format(item.perKm)} ${item.unit}/km`}
        </span>
      )}
      {/* How much this one holds. Bags and rolls differ per material and only
          the people on the floor know which is which, so it is typed in here
          rather than assumed - the API keeps the default and does the counting
          either way. */}
      <PackageSizeInput item={item} onCommit={onSizeCommit} t={t} />
      {/* Per line. A roll cannot leave its machine, so each line's own count
          is the useful figure; a bigbag serves whatever asks for it, so there
          the count is one for the day and only the amounts are per line. */}
      <span className="text-[11px] text-gray-400 dark:text-neutral-500">
        {item.lines
          .map((l) =>
            item.pooled
              ? `${l.line}: ${kmFormat.format(l.needed)} ${item.unit}`
              : `${l.line}: ${t(countKey, { count: l.packages })}`
          )
          .join(" · ")}
      </span>
      {weighable && <BigbagWeights item={item} weights={list} onChange={onWeightsChange} t={t} />}
    </div>
  );
}

// One kind of material a position needs, from CIP's own bill of materials -
// FRP, PE, or whichever groups the API sends. Usually one item, but a cable
// can carry more than one of a kind, so this is a list.
//
// The required amount is the whole run's; "jeszcze" is what is left to issue
// for the part still to be made, and is only shown when it differs - on a
// run nobody has started yet the two are the same number and printing it
// twice would just be noise.
function MaterialCell({ items, t }) {
  if (!items) return <span className="text-gray-400 dark:text-neutral-500">—</span>;
  if (!items.length) return <span className="text-xs text-gray-400 dark:text-neutral-500">{t("noMaterial")}</span>;

  return (
    <div className="space-y-1">
      {items.map((item) => {
        const still =
          item.remainingQuantity !== null &&
          item.requiredQuantity !== null &&
          item.remainingQuantity !== item.requiredQuantity;
        return (
          <div key={item.itemNo}>
            <div className="text-xs font-medium text-gray-900 dark:text-neutral-100">{item.name}</div>
            <div className="text-[11px] tabular-nums text-gray-500 dark:text-neutral-400">
              {item.requiredQuantity === null ? "—" : `${kmFormat.format(item.requiredQuantity)} ${item.unit}`}
              {still && ` · ${t("stillNeeded", { quantity: kmFormat.format(item.remainingQuantity) })}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Two ways to read the same answer. "Pełny" is every stage and every
// number; "prosty" is the four things somebody taking the list out to the
// lines actually carries - which line, which order, and the materials.
const VIEW_FULL = "full";
const VIEW_SIMPLE = "simple";

/**
 * The table's columns for a view, in order.
 *
 * `identity` marks a column that says *what* the row is rather than a
 * number about it - the full view's per-line header row spans exactly those
 * and summarises the rest. `showsWhenMissing` marks the ones that still have
 * something to show for a position CIP did not find.
 *
 * Material and process columns come from the API's own `materialKeys` /
 * `processKeys`, so a kind or a stage nothing needs is not a column here
 * either, and a new one needs no change to this function.
 */
function columnsFor({ view, materialKeys, processKeys, t }) {
  // The group's own code is already its label (FRP, PE), so a new group
  // needs no new translation.
  const materials = materialKeys.map((key) => ({
    id: `material:${key}`,
    label: materialLabel(key),
    identity: true,
    materialKey: key,
  }));

  if (view === VIEW_SIMPLE) {
    // No line column: the line heads its own group, exactly as in the full
    // view, so repeating it on every row would be noise.
    //
    // One stage column, and it is **the stage that line actually runs** (the
    // API's own `lineProcess` - ST strands, SH and FC sheathe, SC is SC).
    // That is the whole point of this view: an ST line is not asked about
    // sheathing, so the other stages are not columns of blanks, and the
    // materials ride inside the stage exactly as they do in the full view.
    return [
      { id: "orderNumber", label: t("columns.orderNumber"), identity: true, showsWhenMissing: true },
      { id: "lineProcess", label: t("columns.process") },
    ];
  }

  // No standalone material columns in the full view: every material is
  // shown inside the stage that consumes it, and repeating it in a column
  // of its own would say the same thing twice with two different "still
  // needed" figures (each stage scales it by its own progress).
  return [
    { id: "position", label: t("columns.position"), identity: true, showsWhenMissing: true },
    { id: "cable", label: t("columns.cable"), identity: true },
    { id: "total", label: t("columns.total"), numeric: true },
    // One per process stage, headed by CIP's own code for it - the codes are
    // what the people reading this screen know the stages by.
    ...processKeys.map((key) => ({ id: `process:${key}`, label: key.toUpperCase(), processKey: key })),
  ];
}

// Per line, and for everything pasted: the lengths add up, the percentage
// does not - it is recomputed from the summed kilometres so a 500 km run
// counts for more than a 10 km one.
const round3 = (n) => Math.round(n * 1000) / 1000;

function summarise(rows, processKeys = []) {
  let totalLength = 0;
  let remainingLength = 0;
  let known = 0;
  for (const row of rows) {
    if (!row.found || row.remainingLength === null) continue;
    totalLength += row.totalLength;
    remainingLength += row.remainingLength;
    known += 1;
  }
  const producedLength = totalLength - remainingLength;

  // Each stage summed down its own column only - never across stages, whose
  // units differ (see ProcessCell).
  const processes = {};
  for (const key of processKeys) {
    let planned = 0;
    let remaining = 0;
    let any = false;
    for (const row of rows) {
      const figures = row.processes?.[key];
      if (!figures) continue;
      planned += figures.planned;
      remaining += figures.remaining;
      any = true;
    }
    if (!any) continue;
    const clamped = Math.min(remaining, planned);
    processes[key] = {
      planned: round3(planned),
      remaining: round3(clamped),
      percent: planned > 0 ? Math.round(((planned - clamped) / planned) * 1000) / 10 : null,
    };
  }

  // The FRP this group still needs, added up per item across its positions -
  // the number somebody loading a forklift works from, since one line is one
  // trip and several of its positions usually take the same FRP.
  const frp = new Map();
  for (const row of rows) {
    for (const item of row.materials?.frp ?? []) {
      const total = frp.get(item.itemNo) ?? { itemNo: item.itemNo, name: item.name, unit: item.unit, remaining: 0 };
      total.remaining += item.remainingQuantity ?? 0;
      frp.set(item.itemNo, total);
    }
  }

  return {
    positions: rows.length,
    known,
    totalLength: round3(totalLength),
    remainingLength: round3(remainingLength),
    producedLength: round3(producedLength),
    percent: totalLength > 0 ? (producedLength / totalLength) * 100 : null,
    processes,
    frp: [...frp.values()].map((total) => ({ ...total, remaining: round3(total.remaining) })),
  };
}

// Three to start with, like the receipt grid - enough to see it is a grid,
// and it grows itself from there (ensureSpareRow) and on a paste.
const INITIAL_ROWS = 3;

export default function ProductionProgressTable() {
  const t = useTranslations("productionProgress");
  const [rows, setRows] = useState(() => Array.from({ length: INITIAL_ROWS }, newProgressRow));
  // How much one roll/bigbag of a given material holds, where it differs
  // from wpsApi's own default - `{ "<itemNo>": <number> }`, typed in on the
  // package panels below. Remembered in this browser only: it is a note to
  // self about the stock on the shelf, not a plant-wide setting, and the
  // counting itself happens server-side either way (see PACKAGE_RULES).
  const [packageSizes, setPackageSizes] = useState(readStoredPackageSizes);
  // The weights of the bigbags standing on the floor, per material
  // (`{ "<itemNo>": [1012, 987, ...] }`), likewise remembered in this browser
  // only. Nothing is sent: the API counts the day at the nominal size, and
  // these answer the other question - how many of the bags I actually have
  // that is (see components/BigbagWeights.js).
  const [bagWeights, setBagWeights] = useState(readStoredBigbagWeights);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | checking | ready | error
  const [error, setError] = useState("");
  const [view, setView] = useState(VIEW_FULL);
  // Column ids switched off by hand. One set across both views: the ids are
  // disjoint except the material ones, so hiding PE stays hidden when the
  // view changes, which is the only shared case and the one worth keeping.
  const [hidden, setHidden] = useState(() => new Set());

  function toggleColumn(id) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filled = rows.some((row) => String(row.number ?? "").trim());

  async function check(sizes = packageSizes) {
    if (!filled || status === "checking") return;
    setStatus("checking");
    setError("");
    try {
      // The grid is serialised to the two-column text the API already
      // parses, so there is one parser for every way this screen is filled.
      const data = await fetchProductionProgress(progressRowsToText(rows), sizes);
      setResult(data);
      setStatus("ready");
    } catch (err) {
      setError(err?.message || t("error"));
      setStatus("error");
    }
  }

  // A package size is committed on blur/Enter, not per keystroke: the count
  // comes back from the API, so every change is a request, and re-asking CIP
  // on each digit of "1250" would be four.
  function setPackageSize(itemNo, raw) {
    const size = Number(String(raw).replace(",", "."));
    const next = { ...packageSizes };
    if (Number.isFinite(size) && size > 0) next[itemNo] = size;
    else delete next[itemNo];
    if (JSON.stringify(next) === JSON.stringify(packageSizes)) return;
    setPackageSizes(next);
    storePackageSizes(next);
    // Recount with it straight away - a size nobody sees applied is a size
    // nobody trusts. Same request the "Sprawdź" button makes.
    if (result) check(next);
  }

  // A weight list, unlike a package size, costs no request: the counting from
  // weights happens here, so it is applied as it is typed.
  //
  // `change` is a function of that item's current list (see BigbagWeights for
  // the blur-then-click case it exists for), so the write is against the
  // latest state and not the render the handler was created in. Persisting
  // from inside the updater is deliberate: it writes the same JSON if React
  // runs it twice, and anything else would store a list one keystroke old.
  function setBigbagWeights(itemNo, change) {
    setBagWeights((current) => {
      const list = typeof change === "function" ? change(current[itemNo] ?? []) : change;
      const next = { ...current };
      if (list.length > 0) next[itemNo] = list;
      else delete next[itemNo];
      storeBigbagWeights(next);
      return next;
    });
  }

  async function exportXlsx() {
    setExportError("");
    setExporting(true);
    try {
      await downloadProductionProgress({ groups, t });
    } catch (err) {
      setExportError(err?.message || t("export.error"));
    } finally {
      setExporting(false);
    }
  }

  function clear() {
    setRows(Array.from({ length: INITIAL_ROWS }, newProgressRow));
    setExportError("");
    setResult(null);
    setStatus("idle");
    setError("");
  }

  // Which stage columns this result has at all - the API leaves out every
  // stage none of the positions goes through, so eleven of CIP's fifteen
  // normally never appear.
  const processKeys = result?.processKeys ?? [];
  // Likewise for the material kinds - a group nothing in the paste needs
  // (no PE anywhere, say) is not sent and so is not a column.
  const materialKeys = result?.materialKeys ?? [];

  // Lines in the order they were pasted, each keeping its own positions in
  // that order too.
  const groups = useMemo(() => {
    if (!result?.rows) return [];
    const byLine = new Map();
    for (const row of result.rows) {
      const key = row.line ?? "";
      if (!byLine.has(key)) byLine.set(key, []);
      byLine.get(key).push(row);
    }
    return [...byLine.entries()].map(([line, rows]) => ({
      line,
      rows,
      summary: summarise(rows, result.processKeys ?? []),
    }));
  }, [result]);

  const total = useMemo(() => (result?.rows ? summarise(result.rows, result.processKeys ?? []) : null), [result]);

  // What a day's run takes of each FRP and each jacket compound, and how
  // many rolls / bigbags that is - worked out by the API, which owns the
  // rule (a day's capacity per line, and a package that cannot be shared
  // between parallel machines).
  const packages = result?.packages ?? {};

  // Which production lines each order is run on, across the whole result.
  // One order genuinely goes to several (a real list had one on ST01, ST02,
  // ST04 and ST05), and that is the thing worth knowing at a glance: the
  // same material has to reach four places, not one.
  const orderLines = useMemo(() => {
    const byOrder = new Map();
    for (const row of result?.rows ?? []) {
      if (!row.line) continue;
      if (!byOrder.has(row.orderNumber)) byOrder.set(row.orderNumber, new Set());
      byOrder.get(row.orderNumber).add(row.line);
    }
    return byOrder;
  }, [result]);

  const columns = useMemo(
    () => columnsFor({ view, materialKeys, processKeys, t }),
    [view, materialKeys, processKeys, t]
  );
  const visibleColumns = columns.filter((column) => !hidden.has(column.id));

  return (
    <div>
      <ProductionProgressGrid
        rows={rows}
        onChange={setRows}
        onAddRow={() => setRows((prev) => [...prev, newProgressRow()])}
        t={t}
      />

      <div className="mt-3 flex items-center gap-3">
        <Button onClick={check} disabled={!filled || status === "checking"}>
          {status === "checking" ? t("checking") : t("check")}
        </Button>
        {(filled || result) && (
          <Button variant="outline" onClick={clear} disabled={status === "checking"}>
            {t("clear")}
          </Button>
        )}
        {status === "ready" && result && (
          <p className="text-sm text-gray-500 dark:text-neutral-400">
            {t("fetched", { positions: result.positions, orders: result.ordersQueried })}
          </p>
        )}
      </div>

      {status === "error" && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {status === "ready" && total && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Stat label={t("summary.total")} value={`${kmFormat.format(total.totalLength)} km`} />
            <Stat label={t("summary.remaining")} value={`${kmFormat.format(total.remainingLength)} km`} />
            <Stat
              label={t("summary.produced")}
              value={`${kmFormat.format(total.producedLength)} km`}
              hint={total.percent === null ? null : `${pctFormat.format(total.percent)}%`}
            />
          </div>

          {PACKAGE_PANELS.map(({ key, heading, count, weights }) => {
            const items = packages[key] ?? [];
            if (items.length === 0) return null;
            return (
              <div
                key={key}
                className="mt-6 rounded-xl border border-gray-200 px-4 py-3 dark:border-neutral-700"
              >
                <p className={`${HEAD_CLS} uppercase`}>
                  {t(heading)}
                  {/* What the counts rest on, from the API rather than from a
                      second copy of the figure here: a day is one line's
                      capacity, so a 150 km order is counted for the day in
                      front of it and counted again tomorrow. */}
                  {result?.dailyKm && (
                    <span className="ml-2 normal-case">{t("perDay", { km: kmFormat.format(result.dailyKm) })}</span>
                  )}
                </p>
                <div className="mt-2 space-y-2">
                  {items.map((item) => (
                    <PackageItemRow
                      key={item.itemNo}
                      item={item}
                      countKey={count}
                      weighable={Boolean(weights)}
                      weights={bagWeights[item.itemNo]}
                      onWeightsChange={setBigbagWeights}
                      onSizeCommit={setPackageSize}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 p-1 dark:border-neutral-700">
              {[
                [VIEW_FULL, t("viewFull")],
                [VIEW_SIMPLE, t("viewSimple")],
              ].map(([id, label]) => (
                <Button
                  key={id}
                  size="sm"
                  variant={view === id ? "default" : "ghost"}
                  onClick={() => setView(id)}
                >
                  {label}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-3">
            {/* One sheet per production line: the list is carried out to the
                floor line by line, and a line's sheet is its orders, what is
                left of each and the FRP and compound each takes. */}
            <Button variant="outline" size="sm" onClick={exportXlsx} disabled={exporting}>
              <Download className="h-4 w-4" />
              {exporting ? t("export.exporting") : t("export.button")}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="sm">
                    <Columns3 className="h-4 w-4" />
                    {t("columnsButton")}
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                {columns.map((column) => {
                  const shown = !hidden.has(column.id);
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      checked={shown}
                      // Hiding the last one would leave a table with no
                      // columns at all, so the only visible column cannot be
                      // switched off.
                      disabled={shown && visibleColumns.length === 1}
                      onCheckedChange={() => toggleColumn(column.id)}
                    >
                      {column.label}
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          </div>

          {exportError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{exportError}</p>}

          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {visibleColumns.map((column) => (
                    <TableHead key={column.id} className={`${HEAD_CLS} ${column.numeric ? NUM_CLS : ""}`}>
                      {column.label}
                      {/* The stage columns all show the same thing, so it is
                          said once in the header instead of in every one of
                          a hundred cells. */}
                      {column.processKey && (
                        <span className="block text-[10px] font-normal text-gray-400 dark:text-neutral-500">
                          {t("unfinished")}
                        </span>
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Both views group by line - the plain one just carries
                    fewer columns under each header. */}
                {groups.map((group) => (
                  <GroupRows
                    key={group.line || "—"}
                    group={group}
                    columns={visibleColumns}
                    orderLines={orderLines}
                    t={t}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-gray-200 px-4 py-3 dark:border-neutral-700">
      <p className={`${HEAD_CLS} uppercase`}>{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-navy-950 dark:text-white">
        {value}
        {hint && <span className="ml-2 text-sm font-normal text-gray-500 dark:text-neutral-400">{hint}</span>}
      </p>
    </div>
  );
}

function GroupRows({ group, columns, orderLines, t }) {
  const { line, rows, summary } = group;
  // The identity columns are what the line's name spans; the numbers after
  // them get the line's own totals. Both follow whatever is visible, so
  // hiding a column never knocks the header row out of alignment.
  const spanned = columns.filter((column) => column.identity).length;
  const summarised = columns.filter((column) => !column.identity);
  // One line, so one stage - taken off the rows rather than re-derived from
  // the name here, since the API is what decides it.
  const lineProcess = rows[0]?.lineProcess ?? null;

  return (
    <>
      {/* The line, with what is left on it per stage - the numbers this
          screen is opened for. A header row rather than a repeated first
          column: the list is read line by line. */}
      <TableRow className="bg-gray-50/80 dark:bg-neutral-800/60">
        <TableCell colSpan={Math.max(1, spanned)} className="font-semibold text-navy-950 dark:text-white">
          {line || t("noLine")}
          <span className="ml-2 text-xs font-normal text-gray-500 dark:text-neutral-400">
            {t("positions", { count: summary.positions })}
          </span>
          {/* What this line still needs in FRP, all its positions added up -
              one line is one trip, and its positions usually take the same
              FRP, so the sum is what gets loaded. */}
          {summary.frp.length > 0 && (
            <span className="ml-3 text-xs font-normal">
              {summary.frp.map((item) => (
                <span key={item.itemNo} className="ml-2 text-gray-500 dark:text-neutral-400">
                  {item.name}{" "}
                  <span className="font-semibold tabular-nums text-navy-700 dark:text-navy-300">
                    {kmFormat.format(item.remaining)} {item.unit}
                  </span>
                </span>
              ))}
            </span>
          )}
        </TableCell>
        {summarised.map((column) => (
          <TableCell
            key={column.id}
            className={column.numeric ? `${NUM_CLS} font-medium text-gray-900 dark:text-neutral-100` : undefined}
          >
            {column.id === "total" && kmFormat.format(summary.totalLength)}
            {column.processKey && <ProcessCell figures={summary.processes[column.processKey]} t={t} />}
            {/* The plain view's one stage column: every row of this group is
                on the same line, so they all run the same stage. */}
            {column.id === "lineProcess" && lineProcess && (
              <ProcessCell figures={summary.processes[lineProcess]} t={t} />
            )}
          </TableCell>
        ))}
      </TableRow>

      {rows.map((row, index) => (
        <PositionRow
          key={`${row.erpNumber ?? row.orderNumber}-${row.orderId ?? ""}-${index}`}
          row={row}
          columns={columns}
          indent
          orderLines={orderLines}
          t={t}
        />
      ))}
    </>
  );
}

// How many production lines this order is run on, across the whole result,
// with their names on hover. Picked out in colour as soon as there is more
// than one, because "this order is on four lines" is a different job to plan
// than "this order is on one" - a muted count would not carry that.
function OrderLines({ orderLines, orderNumber, t }) {
  const lines = orderLines?.get(orderNumber);
  if (!lines?.size) return null;
  const several = lines.size > 1;
  return (
    <span
      title={[...lines].join(", ")}
      className={`ml-1.5 text-[11px] ${
        several ? "font-medium text-navy-700 dark:text-navy-300" : "font-normal text-gray-400 dark:text-neutral-500"
      }`}
    >
      {t("onLines", { count: lines.size })}
    </span>
  );
}

// What one column holds for one position. Switching here, rather than in a
// fixed run of cells, is what lets a column be hidden or a whole view be
// swapped without the row and the header ever disagreeing.
function PositionCell({ column, row, orderLines, t }) {
  if (column.materialKey) return <MaterialCell items={row.materials?.[column.materialKey]} t={t} />;
  if (column.processKey) return <ProcessCell figures={row.processes?.[column.processKey]} t={t} />;

  switch (column.id) {
    case "orderNumber":
      return (
        <span className="font-mono text-xs text-gray-900 dark:text-neutral-100">
          {/* CIP own orderId - the order number *with* its line in brackets
              ("260010303024501(6)"), which is what identifies the run. Only a
              position CIP did not find falls back to the bare number,
              because that is all the paste carried. */}
          {row.orderId || row.orderNumber}
          <OrderLines orderLines={orderLines} orderNumber={row.orderNumber} t={t} />
        </span>
      );
    case "position":
      return (
        <>
          {/* Whatever identifies this line of the order: CIP's job number,
              or the order number when that is all the paste carried. */}
          <div className="font-mono text-xs text-gray-900 dark:text-neutral-100">
            {row.erpNumber || row.orderNumber}
            <OrderLines orderLines={orderLines} orderNumber={row.orderNumber} t={t} />
          </div>
          {row.orderId && <div className="text-[11px] text-gray-400 dark:text-neutral-500">{row.orderId}</div>}
        </>
      );
    case "cable":
      return (
        <>
          <div>{row.cableType || "—"}</div>
          {/* CIP's own status for the line, not something derived from the
              numbers: a run can read 100% while CIP still has it open. */}
          {row.opStatus === 5 && (
            <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">{t("finished")}</div>
          )}
        </>
      );
    case "total":
      return row.totalLength === null ? "—" : kmFormat.format(row.totalLength);
    case "lineProcess": {
      // Which stage, said in the cell rather than the header: it is the
      // line's own, so it differs from row to row.
      if (!row.lineProcess) return <span className="text-gray-400 dark:text-neutral-500">—</span>;
      return (
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-neutral-500">
            {row.lineProcess.toUpperCase()}
          </div>
          {/* Only here: the plain view is the one read while planning what
              to send, so it carries the per-kilometre figure too.

              And the materials are **the kinds this line's own stage puts
              into the cable** (the API's `lineMaterialKeys`), not the ones
              CIP files under the stage: FRP's BOM rows say "SC" while an ST
              line's own stage is "SZ", so reading the stage's own list left
              the FRP off exactly the lines that run it - and reading the
              whole BOM instead sent FRP to a sheathing line, which puts no
              FRP in at all. */}
          <ProcessCell
            figures={row.processes?.[row.lineProcess]}
            materials={lineMaterials(row)}
            showPerKm
            t={t}
          />
        </div>
      );
    }
    default:
      return null;
  }
}

function PositionRow({ row, columns, indent, orderLines, t }) {
  if (!row.found) {
    // Only the columns that still say something about a position CIP did
    // not find; the rest are one span carrying the reason.
    const leading = columns.filter((column) => column.showsWhenMissing);
    const rest = columns.length - leading.length;
    return (
      <TableRow>
        {leading.map((column, index) => (
          <TableCell
            key={column.id}
            className={`font-mono text-xs text-gray-500 dark:text-neutral-400 ${index === 0 && indent ? "pl-6" : ""}`}
          >
            <PositionCell column={column} row={row} orderLines={orderLines} t={t} />
          </TableCell>
        ))}
        <TableCell colSpan={Math.max(1, rest)} className="text-sm text-gray-400 dark:text-neutral-500">
          {t("notFound")}
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      {columns.map((column, index) => (
        <TableCell
          key={column.id}
          className={[
            column.numeric ? `${CELL_CLS} ${NUM_CLS}` : "",
            column.id === "cable" ? `${CELL_CLS} text-xs` : "",
            index === 0 && indent ? "pl-6" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <PositionCell column={column} row={row} orderLines={orderLines} t={t} />
        </TableCell>
      ))}
    </TableRow>
  );
}
