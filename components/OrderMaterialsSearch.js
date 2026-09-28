"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Search, Loader2, ChevronDown, ChevronRight, CornerDownRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { searchCipOrderMaterials } from "@/lib/cipOrdersApi";

const HEAD_CLS =
  "sticky top-0 z-10 bg-gray-50 text-[11px] font-medium tracking-wide text-gray-400 dark:bg-neutral-800 dark:text-neutral-500";
const CELL_CLS = "text-gray-600 dark:text-neutral-300";

// "Zamówienia" tab: search wpsApi's POST /cip-orders/materials/warehouse
// (see that route + wpsApi's AGENTS.md) and show what it returns - a full
// orderId ("...(4)") gives one line's materials, a bare order number can
// give several (one per matching production line), rendered as separate
// tables below each other rather than merged (see `lines` below).
//
// Names come straight from the API (`m.name`, `m.materialChange.fromName`/
// `toName`) - wpsApi already resolves them catalog-first, CIP's own
// description text second (see routes/cipOrders.js's `withCatalogNames`).
// Computing them again here from `descriptionUs`/`descriptionZhs` directly -
// this component's first cut - skipped that catalog lookup entirely, so an
// item whose `descriptionUs` happens to be blank showed CIP's raw Chinese
// text instead of falling through to the catalog name.
function formatQty(n) {
  return typeof n === "number" ? n.toLocaleString("pl-PL", { maximumFractionDigits: 6 }) : (n ?? "");
}

// A changed row shows the already-substituted material (materialChange.to/
// toName) as its own itemCode/name, same as CIP's BOM would if it were
// re-read today - not the stale `itemCode`/`name` the BOM endpoint itself
// still carries for this row (confirmed live: that's the *original*,
// pre-swap item - see wpsApi's AGENTS.md, "Order lookup"). Expanding the row
// is the only place the original still shows, via `materialChange.from` +
// `.fromName`.
function displayItemCode(m) {
  return m.materialChange?.to ?? m.itemCode;
}
function displayName(m) {
  return m.materialChange?.toName || m.name;
}

// Chevron column (dedicated `w-8` first column, same as OrdersCipListTable.js/
// SmMaterialsPanel.js's own expand/collapse pattern) so the itemCode column
// after it lines up flush (`pl-0`) whether or not a given row has a chevron
// in it - an inline chevron inside the itemCode cell itself (the first cut
// of this) shifted that column's text sideways instead.
const CHEVRON_CELL_CLS = "w-8 pl-4";

function MaterialRow({ m, i, t }) {
  const [expanded, setExpanded] = useState(false);
  const changed = Boolean(m.materialChange);
  return (
    <>
      <TableRow
        className={changed ? "cursor-pointer bg-amber-50 dark:bg-amber-500/10" : undefined}
        onClick={changed ? () => setExpanded((prev) => !prev) : undefined}
      >
        <TableCell className={CHEVRON_CELL_CLS}>
          {changed &&
            (expanded ? (
              <ChevronDown className="size-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
            ) : (
              <ChevronRight className="size-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
            ))}
        </TableCell>
        <TableCell className={`pl-0 font-medium ${CELL_CLS}`}>{displayItemCode(m)}</TableCell>
        <TableCell className={CELL_CLS}>{displayName(m)}</TableCell>
        <TableCell className={CELL_CLS}>{m.unit}</TableCell>
        <TableCell className={CELL_CLS}>{formatQty(m.qty)}</TableCell>
        <TableCell className={`pr-4 ${CELL_CLS}`}>{formatQty(m.requiredQuantity)}</TableCell>
      </TableRow>
      {changed && expanded && (
        <>
          {/* Original (default) material - muted, but no strikethrough. */}
          <TableRow className="bg-amber-50/60 dark:bg-amber-500/5">
            <TableCell className={CHEVRON_CELL_CLS} />
            <TableCell className="pl-0 text-gray-400 dark:text-neutral-500">{m.materialChange.from}</TableCell>
            <TableCell className="text-gray-400 dark:text-neutral-500">{m.materialChange.fromName}</TableCell>
            <TableCell className="text-gray-400 dark:text-neutral-500">{m.unit}</TableCell>
            <TableCell className="text-gray-400 dark:text-neutral-500">{formatQty(m.qty)}</TableCell>
            <TableCell className="pr-4 text-gray-400 dark:text-neutral-500">{formatQty(m.requiredQuantity)}</TableCell>
          </TableRow>
          {/* Changed to - what CIP actually uses now, its own chevron-column
              cell carrying the "derived from the row above" connector instead
              of the itemCode cell, so itemCode still lines up with every
              other row's. */}
          <TableRow className="bg-amber-50/60 dark:bg-amber-500/5">
            <TableCell className={CHEVRON_CELL_CLS}>
              <CornerDownRight className="size-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
            </TableCell>
            <TableCell className="pl-0 font-medium text-amber-800 dark:text-amber-300">
              {m.materialChange.to}
            </TableCell>
            <TableCell className="text-amber-800 dark:text-amber-300">{m.materialChange.toName}</TableCell>
            <TableCell className="text-amber-800 dark:text-amber-300">{m.unit}</TableCell>
            <TableCell className="text-amber-800 dark:text-amber-300">{formatQty(m.qty)}</TableCell>
            <TableCell className="pr-4 text-amber-800 dark:text-amber-300">{formatQty(m.requiredQuantity)}</TableCell>
          </TableRow>
          {m.materialChange.changedAt && (
            <TableRow className="bg-amber-50/60 dark:bg-amber-500/5">
              <TableCell className={CHEVRON_CELL_CLS} />
              <TableCell colSpan={5} className="pt-0 pb-2 pl-0 text-[11px] text-gray-400 dark:text-neutral-500">
                {t("changeDetails.changedAt")}: {m.materialChange.changedAt}
              </TableCell>
            </TableRow>
          )}
        </>
      )}
    </>
  );
}

function MaterialsTableForLine({ line, t }) {
  const materials = line.materials ?? [];
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 dark:border-neutral-800">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-gray-200 bg-gray-50 px-4 py-2 dark:border-neutral-800 dark:bg-neutral-800">
        <span className="text-sm font-medium text-gray-600 dark:text-neutral-300">{line.orderId}</span>
        {line.segDescription && (
          <span className="text-xs text-gray-400 dark:text-neutral-500">
            {t("segment")}: {line.segDescription}
          </span>
        )}
      </div>
      {materials.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-neutral-500">{t("empty")}</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={`w-8 ${HEAD_CLS}`} />
              <TableHead className={`pl-0 ${HEAD_CLS}`}>{t("columns.itemCode")}</TableHead>
              <TableHead className={HEAD_CLS}>{t("columns.name")}</TableHead>
              <TableHead className={HEAD_CLS}>{t("columns.unit")}</TableHead>
              <TableHead className={HEAD_CLS}>{t("columns.qty")}</TableHead>
              <TableHead className={`pr-4 ${HEAD_CLS}`}>{t("columns.requiredQuantity")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {materials.map((m, i) => (
              <MaterialRow key={`${m.itemCode}-${i}`} m={m} i={i} t={t} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export default function OrderMaterialsSearch() {
  const t = useTranslations("ordersMaterials");
  const [orderId, setOrderId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lines, setLines] = useState(null); // null = no search done yet

  async function handleSearch(e) {
    e.preventDefault();
    const trimmed = orderId.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    try {
      const data = await searchCipOrderMaterials(trimmed);
      setLines(Array.isArray(data) ? data : [data]);
    } catch (err) {
      setLines(null);
      setError(err?.message || t("error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500 dark:text-neutral-400">{t("searchLabel")}</span>
          <input
            type="text"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-80 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-navy-400 dark:focus:ring-navy-400"
          />
        </label>
        <Button type="submit" disabled={loading || !orderId.trim()}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          {loading ? t("searching") : t("searchButton")}
        </Button>
      </form>

      {error && (
        <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {!error && lines && lines.length > 1 && (
        <p className="mt-4 text-sm text-gray-500 dark:text-neutral-400">{t("multipleLines")}</p>
      )}

      {!error &&
        lines &&
        lines.map((line) => <MaterialsTableForLine key={line.orderId} line={line} t={t} />)}
    </div>
  );
}
