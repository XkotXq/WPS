"use client";

import { useState } from "react";
import MaterialsTable from "@/components/MaterialsTable";
import FrpFilters from "@/components/FrpFilters";

export default function CurrentListSection({ items, columns, onSelectionChange }) {
  const [search, setSearch] = useState("");

  return (
    <div>
      <FrpFilters onGlobalFilterChange={setSearch} />
      <MaterialsTable
        data={items}
        columns={columns}
        globalFilter={search}
        onGlobalFilterChange={setSearch}
        onSelectionChange={onSelectionChange}
      />
    </div>
  );
}
