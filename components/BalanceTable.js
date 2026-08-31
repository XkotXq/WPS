"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import MaterialsTable from "@/components/MaterialsTable";

function formatKm(value) {
  return value.toLocaleString("pl-PL", { maximumFractionDigits: 3 });
}

// Only frp items carry a real catalog item number + full name (joined
// from frp_catalog - see stockRowToSnapshotApi in checks.js); coatedFrp
// and filler only ever had a diameter, so there's nothing to split there.
function itemFields(material, source) {
  if (!source) return { item: "", itemShort: "", diameter: "", xbz: "", color: "" };
  if (material === "frp") {
    const item = source.itemNumber || source.frpNumber || "";
    return { item, itemShort: item.slice(-3), diameter: source.name || source.frpLabel || "", diameterShort: source.frpLabel || "" };
  }
  if (material === "coatedFrp") {
    return { item: "", itemShort: "", diameter: source.diameter || "", xbz: source.type || "" };
  }
  return { item: "", itemShort: "", diameter: source.diameter || "", color: source.color || "" };
}

const ROW_STYLE = {
  used: "bg-rose-50/60 dark:bg-rose-950/20",
  new: "bg-emerald-50/60 dark:bg-emerald-950/20",
  unchanged: "",
};

const STATUS_STYLE = {
  used: "bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400",
  new: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  unchanged: "bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400",
};

// Per-drum diff between the two chosen rounds - see computeBalance() in
// page.js. Colors mirror the old /frp app's bilans xlsx (red = used up,
// green = new spool). Built on MaterialsTable so every column gets the
// same sort/filter UI as the rest of the app, plus a multiselect ("show
// only these") on the Status column.
export default function BalanceTable({ material, rows, usedCount, newCount }) {
  const t = useTranslations("stockBalance");
  const [search, setSearch] = useState("");

  const data = rows.map((row) => ({
    id: row.drumNumber,
    ...itemFields(material, row.source),
    drumNumber: row.drumNumber,
    prevKm: row.prevKm ?? 0,
    hasPrev: row.prevKm !== null,
    currKm: row.currKm ?? 0,
    hasCurr: row.currKm !== null,
    deltaKm: row.deltaKm,
    status: row.status,
    statusLabel: t(`status.${row.status}`),
  }));

  const columns = [
    ...(material === "frp"
      ? [{ key: "item", headerKey: "item", filterFn: "multiselect", sortable: true, simpleKey: "itemShort" }]
      : []),
    ...(material === "filler"
      ? [{ key: "color", headerKey: "color", filterFn: "multiselect", sortable: true }]
      : []),
    {
      key: "diameter",
      headerKey: "diameter",
      filterFn: "multiselect",
      sortable: true,
      ...(material === "frp" && { simpleKey: "diameterShort" }),
    },
    ...(material === "coatedFrp"
      ? [{ key: "xbz", headerKey: "xbz", filterFn: "includesString", sortable: true }]
      : []),
    { key: "drumNumber", headerKey: "spoolNumber", filterFn: "includesString", sortable: true },
    {
      key: "prevKm",
      headerKey: "prevKm",
      filterFn: "inNumberRange",
      sortable: true,
      render: (r) => <span className="tabular-nums">{r.hasPrev ? formatKm(r.prevKm) : "-"}</span>,
    },
    {
      key: "currKm",
      headerKey: "currKm",
      filterFn: "inNumberRange",
      sortable: true,
      render: (r) => <span className="tabular-nums">{r.hasCurr ? formatKm(r.currKm) : "-"}</span>,
    },
    {
      key: "deltaKm",
      headerKey: "delta",
      filterFn: "inNumberRange",
      sortable: true,
      render: (r) => (
        <span
          className={`tabular-nums font-medium ${
            r.deltaKm > 0
              ? "text-emerald-600 dark:text-emerald-400"
              : r.deltaKm < 0
              ? "text-rose-600 dark:text-rose-400"
              : "text-gray-400 dark:text-neutral-500"
          }`}
        >
          {r.deltaKm === 0 ? "-" : `${r.deltaKm > 0 ? "+" : ""}${formatKm(r.deltaKm)}`}
        </span>
      ),
    },
    {
      key: "statusLabel",
      headerKey: "status",
      filterFn: "multiselect",
      sortable: true,
      render: (r) => (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>
          {r.statusLabel}
        </span>
      ),
    },
  ];

  return (
    <div>
      <p className="mb-3 text-sm text-gray-500 dark:text-neutral-400">
        {t("summary", { total: rows.length, used: usedCount, new: newCount })}
      </p>
      <MaterialsTable
        data={data}
        columns={columns}
        globalFilter={search}
        onGlobalFilterChange={setSearch}
        rowClassName={(row) => ROW_STYLE[row.status]}
      />
    </div>
  );
}
