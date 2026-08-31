"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

const MATERIALS = ["frp", "coatedFrp", "filler"];

// Sprawdzanie stocku is split into one real subpage per material (rather
// than the query-param tabs the read-only Stock view uses) so each check
// is its own navigable/back-button-able step.
export default function StockCheckLayout({ children }) {
  const t = useTranslations("stock.tabs");
  const pathname = usePathname();

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-neutral-800">
        {MATERIALS.map((material) => {
          const href = `/dashboard/stock/check/${material}`;
          const active = pathname === href;
          return (
            <Link
              key={material}
              href={href}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "border-navy-950 text-navy-950 dark:border-navy-400 dark:text-white"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-neutral-400 dark:hover:text-neutral-200"
              }`}
            >
              {t(material)}
            </Link>
          );
        })}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}
