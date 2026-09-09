import { Home, Package, ClipboardList, ClipboardCheck, ShoppingCart, PackageMinus, Boxes } from "lucide-react";

export const PAGE_REGISTRY = [
  { href: "/dashboard", key: "home", icon: Home },
  { href: "/dashboard/stock/check/frp", key: "checkStock", icon: ClipboardCheck },
  { href: "/dashboard/stock", key: "currentStock", icon: Package },
  { href: "/dashboard/stock/current", key: "currentList", icon: Package },
  { href: "/dashboard/stock/balance", key: "balance", icon: Package },
  { href: "/dashboard/stock/reports", key: "reports", icon: Package },
  { href: "/dashboard/stock/frp-database", key: "frpDatabase", icon: Package },
  { href: "/dashboard/materials-list-cip", key: "materialsList", icon: ClipboardList },
  { href: "/dashboard/materials-list-cip/history-cip", key: "materialsHistory", icon: ClipboardList },
  { href: "/dashboard/materials-list-cip/reports", key: "reports", icon: ClipboardList },
  { href: "/dashboard/materials-list-sm", key: "materialsListSm", icon: Boxes },
  { href: "/dashboard/materials-list-sm/history-sm", key: "materialsHistorySm", icon: Boxes },
  { href: "/dashboard/orders/cip", key: "ordersCip", icon: ShoppingCart },
  { href: "/dashboard/orders/wms", key: "ordersWmsLists", icon: PackageMinus },
];

export function navLinkClasses(active, collapsed) {
  return `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    collapsed ? "justify-center" : ""
  } ${
    active
      ? "bg-navy-50 dark:bg-navy-500/15 text-navy-950 dark:text-white font-semibold"
      : "text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-800 hover:text-navy-950 dark:hover:text-white"
  }`;
}
