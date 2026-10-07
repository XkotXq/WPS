import { Home, Package, ClipboardList, ClipboardCheck, ShoppingCart, Truck, PackageMinus, Boxes, ShieldCheck } from "lucide-react";

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
  { href: "/dashboard/materials-list-sm", key: "materialsListSm", icon: Boxes },
  { href: "/dashboard/materials-list-sm/history-sm", key: "materialsHistorySm", icon: Boxes },
  { href: "/dashboard/materials-list-sm/catalog-sm", key: "materialsCatalogSm", icon: Boxes },
  { href: "/dashboard/orders/transport", key: "ordersTransportList", icon: Truck },
  { href: "/dashboard/orders/transport/guidelines", key: "ordersTransportGuidelines", icon: Truck },
  { href: "/dashboard/orders/transport/history", key: "ordersTransportHistory", icon: Truck },
  { href: "/dashboard/orders/transport/login-history", key: "ordersTransportLoginHistory", icon: Truck },
  { href: "/dashboard/orders/transport/reports", key: "reports", icon: Truck },
  { href: "/dashboard/orders/transport/short-lengths", key: "ordersTransportShortLengths", icon: Truck },
  { href: "/dashboard/orders/materials", key: "ordersMaterialsSearch", icon: ShoppingCart },
  { href: "/dashboard/orders/wms", key: "ordersWmsLists", icon: PackageMinus },
  { href: "/dashboard/permissions", key: "permissions", icon: ShieldCheck },
];

// Which nav group a page belongs to, for telling two pages with the same
// name apart in search results - "Raporty" exists under both Stan
// magazynowy and Transporty, and a list with two identical rows is no help.
export function pageGroupKey(href) {
  if (href.startsWith("/dashboard/stock")) return "stock";
  if (href.startsWith("/dashboard/materials-list-cip")) return "materials";
  if (href.startsWith("/dashboard/materials-list-sm")) return "materialsSm";
  if (href.startsWith("/dashboard/orders/transport")) return "ordersTransport";
  if (href.startsWith("/dashboard/orders/materials")) return "ordersMaterials";
  if (href.startsWith("/dashboard/orders/wms")) return "ordersWms";
  return null;
}

// Accent- and case-insensitive, so "zamowienia" finds "Zamówienia" - nobody
// reaches for ó when they are in a hurry.
export function foldForSearch(text) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function navLinkClasses(active, collapsed) {
  return `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    collapsed ? "justify-center" : ""
  } ${
    active
      ? "bg-navy-50 dark:bg-navy-500/15 text-navy-950 dark:text-white font-semibold"
      : "text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-800 hover:text-navy-950 dark:hover:text-white"
  }`;
}
