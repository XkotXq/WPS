import { Home, Package, ClipboardList } from "lucide-react";

export const PAGE_REGISTRY = [
  { href: "/dashboard", key: "home", icon: Home },
  { href: "/dashboard/stock", key: "currentStock", icon: Package },
  { href: "/dashboard/stock/previous", key: "previousStocks", icon: Package },
  { href: "/dashboard/stock/balance", key: "balance", icon: Package },
  { href: "/dashboard/stock/reports", key: "reports", icon: Package },
  { href: "/dashboard/stock/frp-database", key: "frpDatabase", icon: Package },
  { href: "/dashboard/materials-list", key: "materialsList", icon: ClipboardList },
  { href: "/dashboard/materials-list/reports", key: "reports", icon: ClipboardList },
];

export function navLinkClasses(active, collapsed) {
  return `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
    collapsed ? "justify-center" : ""
  } ${
    active
      ? "bg-navy-950 dark:bg-navy-500 text-white"
      : "text-gray-600 dark:text-neutral-400 hover:bg-navy-50 dark:hover:bg-neutral-800 hover:text-navy-950 dark:hover:text-white"
  }`;
}
