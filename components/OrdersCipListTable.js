"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import FrpFilters from "@/components/FrpFilters";
import { ORDERS_CIP_SEED } from "@/lib/ordersCipSeed";

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

const HEAD_CLS = "sticky top-0 z-10 bg-gray-50 text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:bg-neutral-800 dark:text-neutral-500";
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

  function toggle(orderNo) {
    setExpanded((prev) => ({ ...prev, [orderNo]: !prev[orderNo] }));
  }

  const orders = useMemo(() => {
    if (!search) return ORDERS_CIP_SEED;
    const needle = search.toLowerCase();
    return ORDERS_CIP_SEED.filter((order) =>
      [order.orderNo, order.line, order.employeeNo, order.note, t(`status.${order.status}`)].some((field) =>
        field?.toLowerCase().includes(needle)
      )
    );
  }, [search, t]);

  return (
    <div>
      <p className="text-sm text-gray-500 dark:text-neutral-400">{t("count", { count: orders.length })}</p>

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
                <TableHead className={HEAD_CLS}>{t("columns.createdAt")}</TableHead>
                <TableHead className={`pr-4 ${HEAD_CLS}`}>{t("columns.note")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
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
                          <TableCell colSpan={2} className={`pr-4 text-gray-400 dark:text-neutral-500`}>
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
