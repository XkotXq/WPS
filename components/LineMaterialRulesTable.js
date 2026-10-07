"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useListKeyboard, listRowClasses } from "@/lib/useListKeyboard";
import { useTranslations } from "next-intl";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ORDER_TYPE_CODES } from "@/lib/orderTypeCodes";
import { Button } from "@/components/ui/button";
import { lineMaterialRulesApi } from "@/lib/lineMaterialRulesApi";
import { smCatalogApi } from "@/lib/smCatalogApi";

const FIELD_CLS =
  "h-10 w-full rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-neutral-100 focus:border-navy-700 dark:focus:border-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400";
const LABEL_CLS = "text-xs font-medium text-gray-500 dark:text-neutral-400";

// "Wytyczne do transportów": manages line_material_rules (wpsApi's
// schema.sql) - one standing note per (production line, material), e.g.
// "SH02 + Glass Yarn/600tex -> krótkie odcinki". Read live by whoever fills
// a "Zamówienie materiału" transport (see OrdersCipListTable.js's own
// lookup once that's wired in) - editing/adding a rule here takes effect on
// every matching order immediately, not just new ones (line_material_rules
// is looked up live, never copied onto an order).
export default function LineMaterialRulesTable() {
  const t = useTranslations("ordersTransportGuidelines");
  // The type labels live with the orders they belong to, not duplicated here.
  const tTypes = useTranslations("ordersTransport.types");
  const [lines, setLines] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [rules, setRules] = useState([]);
  const [loadError, setLoadError] = useState(false);

  // Several lines at once for the one note being set, e.g. SH01/SH02/SH03/
  // ST02 all getting "krótkie odcinki" for the same material in one go -
  // saved as one line_material_rules row per selected line (see handleSave).
  const [selectedLines, setSelectedLines] = useState([]);
  const [itemSearch, setItemSearch] = useState("");
  // Several materials at once, the same way several lines are picked: the
  // note is saved once per (line, material) pair, so choosing 3 lines and 4
  // materials writes 12 rules in one go - which is how this is actually
  // used ("na tych liniach, dla tych nici: krótkie odcinki").
  const [selectedItems, setSelectedItems] = useState([]); // [{ itemNo, itemName }]
  // "" = any kind of transport. A guideline can be about a kind of job
  // rather than a place - "every water refill needs the cap from the SH
  // side" - and can combine that with a line and a material.
  const [orderType, setOrderType] = useState("");
  const [note, setNote] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleLine(name) {
    setSelectedLines((prev) => (prev.includes(name) ? prev.filter((l) => l !== name) : [...prev, name]));
  }

  function toggleItem(entry) {
    setSelectedItems((prev) =>
      prev.some((i) => i.itemNo === entry.itemNo)
        ? prev.filter((i) => i.itemNo !== entry.itemNo)
        : [...prev, entry]
    );
  }

  useEffect(() => {
    Promise.all([lineMaterialRulesApi.lines(), smCatalogApi.list(), lineMaterialRulesApi.list()])
      .then(([lns, cat, rls]) => {
        setLines(lns);
        setCatalog(cat);
        setRules(rls);
      })
      .catch(() => setLoadError(true));
  }, []);

  const matches = useMemo(() => {
    const needle = itemSearch.trim().toLowerCase();
    if (!needle) return [];
    return catalog
      .filter((entry) => entry.itemNo.toLowerCase().includes(needle) || entry.itemName.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [catalog, itemSearch]);

  // Ticks the row and **leaves the list open**: the whole point of the
  // checkboxes is picking more than one, and a list that closed on the
  // first tick would mean re-typing the query for every material.
  const pickMatch = useCallback(
    (i) => {
      const entry = matches[i];
      if (entry) toggleItem(entry);
    },
    [matches]
  );
  const matchKeys = useListKeyboard({
    length: matches.length,
    onPick: pickMatch,
    onEscape: () => setPickerOpen(false),
  });

  function resetForm() {
    setSelectedLines([]);
    setItemSearch("");
    setSelectedItems([]);
    setOrderType("");
    setNote("");
    setEditingId(null);
    setError("");
  }

  function startEdit(rule) {
    // A rule scoped only to a type has no line at all.
    setSelectedLines(rule.lineName ? [rule.lineName] : []);
    setOrderType(rule.orderType ?? "");
    // One rule is one pair, so editing starts from that single material -
    // more can be ticked on before saving, which then writes the others as
    // new rules alongside it.
    setSelectedItems(rule.itemNo ? [{ itemNo: rule.itemNo, itemName: rule.itemName || rule.itemNo }] : []);
    setItemSearch("");
    setNote(rule.note);
    setEditingId(rule.id);
    setError("");
  }

  // Upsert by (line, item), once per selected line - saving over an
  // existing pair (whether picked via "Edytuj" or just re-picked fresh)
  // replaces its note, same as wpsApi's own upsertLineMaterialRule. One
  // request per line rather than a batch endpoint: this table is a small,
  // rarely-edited reference list, not a bulk-import path.
  async function handleSave() {
    // The material is optional - without one the guideline covers the
    // whole line, whatever is brought to it (see wpsApi's own
    // upsertLineMaterialRule).
    // At least one scope, since a rule naming none would apply to every
    // transport in the plant - wpsApi refuses that too.
    if ((!selectedLines.length && !orderType && !selectedItems.length) || !note.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      // No material ticked -> one line-wide rule per line (itemNo null).
      // Otherwise every (line, material) pair, which is what the checkboxes
      // are for.
      const itemNos = selectedItems.length ? selectedItems.map((i) => i.itemNo) : [null];
      // No line ticked is now a legitimate scope of its own (a rule about a
      // kind of transport, wherever it goes), so the loop runs once over a
      // single null rather than not at all.
      const lineNames = selectedLines.length ? selectedLines : [null];
      const saved = await Promise.all(
        lineNames.flatMap((lineName) =>
          itemNos.map((itemNo) =>
            lineMaterialRulesApi.upsert({ lineName, itemNo, orderType: orderType || null, note: note.trim() })
          )
        )
      );
      setRules((prev) => {
        // The key is the whole scope now - two rules can share a line and a
        // material and still differ by the kind of transport.
        const keyOf = (r) => `${r.lineName ?? ""}|${r.itemNo ?? ""}|${r.orderType ?? ""}`;
        const savedKeys = new Set(saved.map(keyOf));
        const next = prev.filter((r) => !savedKeys.has(keyOf(r)));
        return [...next, ...saved].sort(
          // Line-wide rules first within a line - they are the broader
          // statement, and itemNo is null on them so a bare localeCompare
          // would throw.
          // lineName can be null on a type-only rule, so neither side may be
          // compared bare - that threw before this existed.
          (a, b) =>
            (a.lineName ?? "").localeCompare(b.lineName ?? "") ||
            (a.orderType ?? "").localeCompare(b.orderType ?? "") ||
            (a.itemNo ?? "").localeCompare(b.itemNo ?? "")
        );
      });
      resetForm();
    } catch (err) {
      setError(err.message || t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id) {
    try {
      await lineMaterialRulesApi.remove(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
      if (editingId === id) resetForm();
    } catch {
      setError(t("removeError"));
    }
  }

  return (
    <div>
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-neutral-800 dark:bg-neutral-800/50">
        <div className="flex flex-col gap-1">
          <span className={LABEL_CLS}>
            {t("lineLabel")}
            {selectedLines.length > 1 && (
              <span className="ml-1.5 font-normal normal-case text-gray-400 dark:text-neutral-500">
                {t("linesSelected", { count: selectedLines.length })}
              </span>
            )}
          </span>
          {/* Several lines at once for the one note below - see
              `selectedLines`' own comment. */}
          <div className="flex flex-wrap gap-1.5">
            {lines.map((name) => {
              const active = selectedLines.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleLine(name)}
                  aria-pressed={active}
                  className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "border-navy-700 bg-navy-700 text-white dark:border-navy-400 dark:bg-navy-400 dark:text-navy-950"
                      : "border-gray-200 bg-white text-gray-600 hover:border-navy-700 hover:text-navy-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-navy-400 dark:hover:text-navy-300"
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-neutral-500">
            {t("typeLabel")}
          </span>
          <select
            value={orderType}
            onChange={(e) => setOrderType(e.target.value)}
            className="h-10 w-full max-w-xs rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-navy-700 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-navy-400 dark:focus:ring-navy-400"
          >
            <option value="">{t("anyType")}</option>
            {ORDER_TYPE_CODES.map((code) => (
              <option key={code} value={code}>
                {tTypes(code)}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="relative flex min-w-56 flex-1 flex-col gap-1">
          <span className={LABEL_CLS}>
            {t("materialLabel")}
            {selectedItems.length > 1 && (
              <span className="ml-1.5 font-normal normal-case text-gray-400 dark:text-neutral-500">
                {t("materialsSelected", { count: selectedItems.length })}
              </span>
            )}
          </span>
          <input
            className={FIELD_CLS}
            value={itemSearch}
            onChange={(e) => {
              setItemSearch(e.target.value);
              setPickerOpen(true);
            }}
            onFocus={() => setPickerOpen(true)}
            onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
            onKeyDown={matchKeys.onKeyDown}
            placeholder={t("materialPlaceholder")}
          />
          {pickerOpen && itemSearch.trim() && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
              {matches.length === 0 ? (
                <p className="px-3 py-2 text-sm text-gray-400 dark:text-neutral-500">{t("noMatches")}</p>
              ) : (
                matches.map((entry, i) => {
                  const checked = selectedItems.some((it) => it.itemNo === entry.itemNo);
                  return (
                    <button
                      key={entry.itemNo}
                      ref={(el) => matchKeys.registerRow(i, el)}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickMatch(i)}
                      onMouseEnter={() => matchKeys.setIndex(i)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${listRowClasses(
                        i === matchKeys.index
                      )}`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          checked
                            ? "border-navy-700 bg-navy-700 text-white dark:border-navy-400 dark:bg-navy-400 dark:text-navy-950"
                            : "border-gray-300 dark:border-neutral-600"
                        }`}
                      >
                        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      <span className="truncate">
                        <span className="font-medium text-gray-900 dark:text-neutral-100">{entry.itemName}</span>
                        <span className="ml-1.5 text-gray-400 dark:text-neutral-500">{entry.itemNo}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}
          {selectedItems.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {selectedItems.map((entry) => (
                <span
                  key={entry.itemNo}
                  className="inline-flex max-w-full items-center gap-1 rounded-md bg-navy-50 px-2 py-0.5 text-xs text-navy-800 dark:bg-navy-500/15 dark:text-navy-200"
                >
                  <span className="truncate">
                    {entry.itemName}
                    <span className="ml-1 text-navy-500 dark:text-navy-300/70">{entry.itemNo}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleItem(entry)}
                    aria-label={t("materialRemove")}
                    className="shrink-0 cursor-pointer rounded p-0.5 hover:bg-navy-100 dark:hover:bg-navy-500/25"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </label>

        <label className="flex min-w-56 flex-[2] flex-col gap-1">
          <span className={LABEL_CLS}>{t("noteLabel")}</span>
          <input
            className={FIELD_CLS}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("notePlaceholder")}
          />
        </label>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={!selectedLines.length || !note.trim() || saving}>
            {t("save")}
          </Button>
          {editingId && (
            <Button variant="outline" type="button" onClick={resetForm} title={t("cancelEdit")}>
              <X className="size-4" />
            </Button>
          )}
        </div>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {loadError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{t("loadError")}</p>}

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 dark:border-neutral-800">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">{t("columns.line")}</TableHead>
              <TableHead>{t("columns.type")}</TableHead>
              <TableHead>{t("columns.material")}</TableHead>
              <TableHead>{t("columns.note")}</TableHead>
              <TableHead className="w-20 pr-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-gray-400 dark:text-neutral-500">
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="pl-4 font-medium text-gray-900 dark:text-neutral-100">
                    {/* No line means the rule is about a kind of transport
                        wherever it goes - said in words, like the material
                        cell below, rather than left blank. */}
                    {rule.lineName ?? (
                      <span className="font-normal italic text-gray-500 dark:text-neutral-400">{t("allLines")}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-neutral-300">
                    {rule.orderType ? (
                      tTypes(rule.orderType)
                    ) : (
                      <span className="italic text-gray-500 dark:text-neutral-400">{t("anyType")}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {/* A guideline with no material covers the whole line - said
                        in words rather than left as an empty cell, which
                        would read as missing data. */}
                    {rule.itemNo ? (
                      <>
                        <span className="font-medium text-gray-900 dark:text-neutral-100">{rule.itemName || rule.itemNo}</span>
                        <span className="ml-1.5 text-gray-400 dark:text-neutral-500">{rule.itemNo}</span>
                      </>
                    ) : (
                      <span className="italic text-gray-500 dark:text-neutral-400">{t("allMaterials")}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-gray-600 dark:text-neutral-300">{rule.note}</TableCell>
                  <TableCell className="pr-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(rule)}
                        title={t("edit")}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(rule.id)}
                        title={t("remove")}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:text-neutral-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
