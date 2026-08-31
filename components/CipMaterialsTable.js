"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import MaterialsTable from "@/components/MaterialsTable";
import FrpFilters from "@/components/FrpFilters";

const COLUMNS = [
  { key: "itemNo", headerKey: "materialsItemNo", filterFn: "includesString", sortable: true },
  { key: "itemName", headerKey: "materialsItemName", filterFn: "includesString", sortable: true, className: "max-w-[220px] truncate" },
  { key: "specifications", headerKey: "materialsSpec", filterFn: "inNumberRange", sortable: true },
  { key: "locationCode", headerKey: "materialsLocation", filterFn: "multiselect", sortable: true },
  { key: "note", headerKey: "note", filterFn: "includesString" },
  { key: "createTime", headerKey: "materialsCreateTime", filterFn: "includesString", sortable: true },
];

// Live inventory from the old CIP system (materialTemporaryStorageWarehouse)
// - fetched server-side in page.js (server-to-server, no CORS) with the
// viewer's own CIP session token, then just rendered here.
export default function CipMaterialsTable({ records }) {
  const t = useTranslations("materialsList");
  const [search, setSearch] = useState("");

  const data = records.map((r) => ({
    id: r.id,
    itemNo: r.itemNo ?? "",
    itemName: r.itemName ?? "",
    specifications: r.specifications ?? "",
    locationCode: r.locationCode ?? "",
    note: r.note ?? "",
    createTime: r.createTime ?? "",
  }));

  return (
    <div>
      <p className="mb-3 text-sm text-gray-500 dark:text-neutral-400">{t("count", { count: data.length })}</p>
      <FrpFilters onGlobalFilterChange={setSearch} />
      <MaterialsTable data={data} columns={COLUMNS} globalFilter={search} onGlobalFilterChange={setSearch} />
    </div>
  );
}
