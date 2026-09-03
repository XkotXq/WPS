import { Home, Package, ClipboardList, ClipboardCheck, ShoppingCart, PackageMinus } from "lucide-react";

export const PAGE_REGISTRY = [
  { href: "/dashboard", key: "home", icon: Home },
  { href: "/dashboard/stock/check/frp", key: "checkStock", icon: ClipboardCheck },
  { href: "/dashboard/stock", key: "currentStock", icon: Package },
  { href: "/dashboard/stock/current", key: "currentList", icon: Package },
  { href: "/dashboard/stock/balance", key: "balance", icon: Package },
  { href: "/dashboard/stock/reports", key: "reports", icon: Package },
  { href: "/dashboard/stock/frp-database", key: "frpDatabase", icon: Package },
  { href: "/dashboard/materials-list", key: "materialsList", icon: ClipboardList },
  { href: "/dashboard/materials-list/history", key: "materialsHistory", icon: ClipboardList },
  { href: "/dashboard/materials-list/reports", key: "reports", icon: ClipboardList },
  { href: "/dashboard/orders/cip", key: "ordersCip", icon: ShoppingCart },
  { href: "/dashboard/orders/wms", key: "ordersWmsLists", icon: PackageMinus },
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
