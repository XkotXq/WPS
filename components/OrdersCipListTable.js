"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import FrpFilters from "@/components/FrpFilters";
import { ORDERS_CIP_SEED } from "@/lib/ordersCipSeed";
import { smCatalogApi } from "@/lib/smCatalogApi";
import { getCipSession } from "@/lib/cipSession";
import { sanitizeQuantityInput } from "@/lib/quantityInput";

// Same real line codes as ordersCipSeed.js's own data (see that file's
// comment) - SH01-07, ST01-13, FC01-03, FL01, not a made-up "Linia 1/2/3/4".
const LINE_CODES = [
  ...Array.from({ length: 7 }, (_, i) => `SH0${i + 1}`),
  ...Array.from({ length: 13 }, (_, i) => `ST${String(i + 1).padStart(2, "0")}`),
  "FC01",
  "FC02",
  "FC03",
  "FL01",
];

const FIELD_CLS =
  "h-10 w-full rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 text-sm text-gray-900 dark:text-neutral-100 focus:border-navy-700 dark:focus:border-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400";
const LABEL_CLS = "text-xs font-medium text-gray-500 dark:text-neutral-400";

function RequiredMark() {
  return <span className="text-red-600 dark:text-red-400"> *</span>;
}

// Next sequential order number for the current year - ZM/<year>/<4-digit
// running number> matching the seed's own format (see ordersCipSeed.js).
function nextOrderNo(existingOrders) {
  const year = new Date().getFullYear();
  const highest = existingOrders.reduce((max, o) => {
    const match = o.orderNo.match(/(\d+)$/);
    return match ? Math.max(max, parseInt(match[1], 10)) : max;
  }, 0);
  return `ZM/${year}/${String(highest + 1).padStart(4, "0")}`;
}

// "Zamów": pick a line, then add materials one at a time by searching the
// same reference catalog Materiały SM uses (sm_catalog, via smCatalogApi) -
// its unit comes along for free instead of the operator having to know it
// by heart. Local-only, same as the rest of this table (see the
// component's own comment) - onCreate just prepends a plain order object,
// no backend call.
function NewOrderPanel({ open, onOpenChange, onCreate, t }) {
  const [line, setLine] = useState("");
  const [catalog, setCatalog] = useState([]);
  const [rows, setRows] = useState([]);
  const [itemSearch, setItemSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLine("");
    setRows([]);
    setItemSearch("");
    setPickerOpen(false);
  }, [open]);

  // Fetched fresh every time the panel opens (not cached at the page level,
  // unlike Materiały SM's own copy of this same list) - this panel is opened
  // rarely enough that a stale catalog from earlier in the session isn't
  // worth the extra prop plumbing.
  useEffect(() => {
    if (!open) return;
    smCatalogApi.list().then(setCatalog).catch(() => {});
  }, [open]);

  const matches = useMemo(() => {
    const needle = itemSearch.trim().toLowerCase();
    if (!needle) return [];
    return catalog
      .filter((entry) => !rows.some((row) => row.itemNo === entry.itemNo))
      .filter((entry) => entry.itemNo.toLowerCase().includes(needle) || entry.itemName.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [catalog, itemSearch, rows]);

  function addItem(entry) {
    setRows((prev) => [...prev, { itemNo: entry.itemNo, itemName: entry.itemName, unit: entry.unit, quantity: "" }]);
    setItemSearch("");
    setPickerOpen(false);
  }

  function updateQuantity(itemNo, value) {
    setRows((prev) => prev.map((row) => (row.itemNo === itemNo ? { ...row, quantity: sanitizeQuantityInput(value) } : row)));
  }

  function removeRow(itemNo) {
    setRows((prev) => prev.filter((row) => row.itemNo !== itemNo));
  }

  const validRows = rows.filter((row) => parseFloat(row.quantity) > 0);
  const canSubmit = Boolean(line) && validRows.length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    const session = await getCipSession().catch(() => null);
    onCreate({
      line,
      employeeNo: session?.userId ?? "",
      items: validRows.map((row) => ({ itemNo: row.itemNo, itemName: row.itemName, quantity: row.quantity, note: "-" })),
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("newOrderPanel.title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>
              {t("newOrderPanel.lineLabel")}
              <RequiredMark />
            </span>
            <select className={FIELD_CLS} value={line} onChange={(e) => setLine(e.target.value)}>
              <option value="">{t("newOrderPanel.linePlaceholder")}</option>
              {LINE_CODES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>

          <label className="relative flex flex-col gap-1">
            <span className={LABEL_CLS}>{t("newOrderPanel.addItemLabel")}</span>
            <input
              className={FIELD_CLS}
              value={itemSearch}
              onChange={(e) => {
                setItemSearch(e.target.value);
                setPickerOpen(true);
              }}
              onFocus={() => setPickerOpen(true)}
              onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
              placeholder={t("newOrderPanel.addItemPlaceholder")}
            />
            {pickerOpen && itemSearch.trim() && (
              <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                {matches.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-gray-400 dark:text-neutral-500">{t("newOrderPanel.noMatches")}</p>
                ) : (
                  matches.map((entry) => (
                    <button
                      key={entry.itemNo}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => addItem(entry)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-neutral-800"
                    >
                      <span className="truncate">
                        <span className="font-medium text-gray-900 dark:text-neutral-100">{entry.itemName}</span>
                        <span className="ml-1.5 text-gray-400 dark:text-neutral-500">{entry.itemNo}</span>
                      </span>
                      {entry.unit && <span className="shrink-0 text-xs text-gray-400 dark:text-neutral-500">{entry.unit}</span>}
                    </button>
                  ))
                )}
              </div>
            )}
          </label>

          {rows.length > 0 && (
            <div className="flex flex-col gap-1">
              {rows.map((row) => (
                <div
                  key={row.itemNo}
                  className="flex items-center gap-2 rounded-lg bg-gray-50 dark:bg-neutral-800/50 px-3 py-1.5 text-sm"
                >
                  <div className="flex-1 truncate">
                    <span className="font-medium text-gray-900 dark:text-neutral-100">{row.itemName}</span>
                    <span className="ml-1.5 text-gray-400 dark:text-neutral-500">{row.itemNo}</span>
                  </div>
                  <input
                    className="h-8 w-24 rounded-md border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 text-right text-sm tabular-nums text-gray-900 dark:text-neutral-100 focus:border-navy-700 dark:focus:border-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400"
                    inputMode="decimal"
                    autoFocus
                    placeholder="0"
                    value={row.quantity}
                    onChange={(e) => updateQuantity(row.itemNo, e.target.value)}
                  />
                  {row.unit && <span className="w-8 shrink-0 text-xs text-gray-400 dark:text-neutral-500">{row.unit}</span>}
                  <button
                    type="button"
                    onClick={() => removeRow(row.itemNo)}
                    className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:text-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
                    title={t("newOrderPanel.removeRow")}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("newOrderPanel.cancel")}
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
            {t("newOrderPanel.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_STYLES = {
  new: "bg-navy-50 text-navy-700 dark:bg-navy-500/15 dark:text-navy-300",
  inProgress: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  done: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  cancelled: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

function StatusBadge({ status }) {
  const t = useTranslations("ordersCip");
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? STATUS_STYLES.new}`}>
      {t(`status.${status}`)}
    </span>
  );
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(date);
}

const HEAD_CLS = "sticky top-0 z-10 bg-gray-50 text-[11px] font-medium tracking-wide text-gray-400 dark:bg-neutral-800 dark:text-neutral-500";
const CELL_CLS = "text-gray-600 dark:text-neutral-300";

// Local-only concept table, same status as Materiały SM (see AGENTS.md's
// "Materiały SM" section) - "Zamówienia" has no backend endpoint yet, so
// this renders straight from a static seed (lib/ordersCipSeed.js) instead
// of real CIP order data. Not built on the shared MaterialsTable - that
// component's columns all read one flat row shape, and an order's own
// fields (status/line/employeeNo) share nothing with its line items'
// (itemNo/itemName/quantity), so this instead mirrors SmMaterialsPanel's
// own hand-rolled groupParent/groupChild expand pattern: a chevron toggles
// each order row open to reveal its ordered items indented underneath,
// same tree-line treatment.
export default function OrdersCipListTable() {
  const t = useTranslations("ordersCip");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState({});
  const [ordersData, setOrdersData] = useState(ORDERS_CIP_SEED);
  const [newOrderOpen, setNewOrderOpen] = useState(false);

  function toggle(orderNo) {
    setExpanded((prev) => ({ ...prev, [orderNo]: !prev[orderNo] }));
  }

  // New order goes straight to "new"/onto the top of the list - same
  // local-only concept as the rest of this table (see its own comment),
  // no backend call.
  function handleCreateOrder({ line, employeeNo, items }) {
    const orderNo = nextOrderNo(ordersData);
    const order = {
      id: orderNo,
      orderNo,
      status: "new",
      line,
      employeeNo,
      fulfilledBy: "-",
      createdAt: new Date().toISOString(),
      note: "-",
      items,
    };
    setOrdersData((prev) => [order, ...prev]);
  }

  const orders = useMemo(() => {
    if (!search) return ordersData;
    const needle = search.toLowerCase();
    return ordersData.filter((order) =>
      [order.orderNo, order.line, order.employeeNo, order.note, t(`status.${order.status}`)].some((field) =>
        field?.toLowerCase().includes(needle)
      )
    );
  }, [ordersData, search, t]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-neutral-400">{t("count", { count: orders.length })}</p>
        <Button size="sm" className="gap-1.5" onClick={() => setNewOrderOpen(true)}>
          <Plus className="h-4 w-4" />
          {t("newOrderPanel.trigger")}
        </Button>
      </div>

      <NewOrderPanel open={newOrderOpen} onOpenChange={setNewOrderOpen} onCreate={handleCreateOrder} t={t} />

      <div className="mt-4">
        <FrpFilters onGlobalFilterChange={setSearch} />

        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-neutral-800">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800">
                <TableHead className={`w-8 ${HEAD_CLS}`} />
                <TableHead className={`pl-0 ${HEAD_CLS}`}>{t("columns.orderNo")}</TableHead>
                <TableHead className={HEAD_CLS}>{t("columns.status")}</TableHead>
                <TableHead className={HEAD_CLS}>{t("columns.line")}</TableHead>
                <TableHead className={HEAD_CLS}>{t("columns.employeeNo")}</TableHead>
                <TableHead className={HEAD_CLS}>{t("columns.fulfilledBy")}</TableHead>
                <TableHead className={HEAD_CLS}>{t("columns.createdAt")}</TableHead>
                <TableHead className={`pr-4 ${HEAD_CLS}`}>{t("columns.note")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-gray-400 dark:text-neutral-500">
                    {t("emptyStatus")}
                  </TableCell>
                </TableRow>
              )}
              {orders.map((order) => {
                const isOpen = Boolean(expanded[order.orderNo]);
                return (
                  <Fragment key={order.orderNo}>
                    <TableRow onClick={() => toggle(order.orderNo)} className="cursor-pointer">
                      <TableCell className="w-8 pl-4">
                        {isOpen ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        )}
                      </TableCell>
                      <TableCell className={`pl-0 font-medium ${CELL_CLS}`}>{order.orderNo}</TableCell>
                      <TableCell>
                        <StatusBadge status={order.status} />
                      </TableCell>
                      <TableCell className={CELL_CLS}>{order.line}</TableCell>
                      <TableCell className={CELL_CLS}>{order.employeeNo}</TableCell>
                      <TableCell className={CELL_CLS}>{order.fulfilledBy}</TableCell>
                      <TableCell className={CELL_CLS}>{formatDateTime(order.createdAt)}</TableCell>
                      <TableCell className={`pr-4 ${CELL_CLS}`}>{order.note}</TableCell>
                    </TableRow>
                    {isOpen &&
                      order.items.map((item) => (
                        <TableRow key={`${order.orderNo}-${item.itemNo}`} className="bg-gray-50/60 dark:bg-neutral-900/40">
                          <TableCell className="relative w-8 pl-4">
                            <span className="absolute inset-y-0 left-6 flex w-3.5 justify-center">
                              <span className="h-full w-px bg-gray-300 dark:bg-neutral-600" />
                            </span>
                          </TableCell>
                          <TableCell className={`pl-2 ${CELL_CLS}`}>{item.itemNo}</TableCell>
                          <TableCell colSpan={2} className={CELL_CLS}>
                            {item.itemName}
                          </TableCell>
                          <TableCell className={`tabular-nums ${CELL_CLS}`}>{item.quantity}</TableCell>
                          <TableCell colSpan={3} className={`pr-4 text-gray-400 dark:text-neutral-500`}>
                            {item.note}
                          </TableCell>
                        </TableRow>
                      ))}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
