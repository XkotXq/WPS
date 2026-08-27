"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

const MIN_SEARCH_LENGTH = 3;

export default function FrpFilters({ onGlobalFilterChange }) {
  const t = useTranslations("stock.filters");
  const [searchValue, setSearchValue] = useState("");

  function runSearch() {
    onGlobalFilterChange(searchValue.trim().length >= MIN_SEARCH_LENGTH ? searchValue : "");
  }

  function handleSubmit(event) {
    event.preventDefault();
    runSearch();
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 dark:text-neutral-500" />
        <input
          type="text"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className="h-11 w-full rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 pl-11 pr-4 text-sm text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:border-navy-700 dark:focus:border-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400"
        />
      </div>
      <Button type="submit" className="h-11 gap-2 px-4">
        <Search className="h-4 w-4" />
        {t("search")}
      </Button>
    </form>
  );
}
