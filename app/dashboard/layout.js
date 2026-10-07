"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLocalStorage } from "usehooks-ts";
import {
  Home,
  LogOut,
  Package,
  ClipboardList,
  ShoppingCart,
  Truck,
  PackageMinus,
  Boxes,
  ShieldCheck,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
} from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import RecentTabsBar from "@/components/RecentTabsBar";
import NavGroup from "@/components/NavGroup";
import { PAGE_REGISTRY, navLinkClasses, pageGroupKey, foldForSearch } from "@/lib/dashboard-pages";
import { useListKeyboard, listRowClasses } from "@/lib/useListKeyboard";
import { logoutCip, getCipSession } from "@/lib/cipSession";

const SIDEBAR_COLLAPSED_KEY = "wms-sidebar-collapsed";
const RECENT_PAGES_KEY = "wms-recent-pages";
const STOCK_BASE_PATH = "/dashboard/stock";
const MATERIALS_BASE_PATH = "/dashboard/materials-list-cip";
const MATERIALS_SM_BASE_PATH = "/dashboard/materials-list-sm";
const ORDERS_TRANSPORT_BASE_PATH = "/dashboard/orders/transport";
const ORDERS_MATERIALS_BASE_PATH = "/dashboard/orders/materials";
const ORDERS_WMS_BASE_PATH = "/dashboard/orders/wms";
const MAX_RECENT_PAGES = 7;
export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const tNav = useTranslations("nav");
  const tDashboard = useTranslations("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  // Phone/tablet only: the sidebar is off-canvas below md and slides in over
  // the page. At lg and up it is a column again and this is ignored, which is
  // why it is a separate piece of state from `collapsed` (that one is the
  // desktop icons-only mode, and means nothing in a drawer).
  const [navOpen, setNavOpen] = useState(false);
  const [isPhone, setIsPhone] = useState(false);
  const [query, setQuery] = useState("");
  const [stockOpen, setStockOpen] = useState(() => pathname.startsWith(STOCK_BASE_PATH));
  const [materialsOpen, setMaterialsOpen] = useState(() =>
    pathname.startsWith(MATERIALS_BASE_PATH)
  );
  const [materialsSmOpen, setMaterialsSmOpen] = useState(() =>
    pathname.startsWith(MATERIALS_SM_BASE_PATH)
  );
  const [ordersTransportOpen, setOrdersTransportOpen] = useState(() =>
    pathname.startsWith(ORDERS_TRANSPORT_BASE_PATH)
  );
  const [ordersMaterialsOpen, setOrdersMaterialsOpen] = useState(() =>
    pathname.startsWith(ORDERS_MATERIALS_BASE_PATH)
  );
  const [ordersWmsOpen, setOrdersWmsOpen] = useState(() => pathname.startsWith(ORDERS_WMS_BASE_PATH));
  const [recentPaths, setRecentPaths] = useLocalStorage(RECENT_PAGES_KEY, []);
  const [mounted, setMounted] = useState(false);
  const [session, setSession] = useState(null);

  const mruRef = useRef([]);

  useEffect(() => {
    setMounted(true);
    getCipSession().then(setSession);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (stored) setCollapsed(stored === "true");
  }, []);

  // Tapping a link in the drawer navigates *and* closes it - leaving it open
  // over the page somebody just asked for is the classic mobile-nav bug.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  // Matches the md breakpoint the drawer itself switches at (768px) - kept
  // in JS as well because `collapsed` is a piece of state, not a class, and
  // it has to mean nothing on a phone.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsPhone(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // The drawer is the topmost thing on screen, so Escape should close it.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  useEffect(() => {
    if (!PAGE_REGISTRY.some((page) => page.href === pathname)) return;
    setRecentPaths((prev) => {
      if (prev.includes(pathname)) return prev;
      const next = [...prev, pathname];
      return next.length > MAX_RECENT_PAGES ? next.slice(next.length - MAX_RECENT_PAGES) : next;
    });
    mruRef.current = [...mruRef.current.filter((p) => p !== pathname), pathname];
  }, [pathname, setRecentPaths]);

  function handleCloseTab(href) {
    setRecentPaths((prev) => {
      const next = prev.filter((p) => p !== href);
      if (href === pathname) {
        const mru = mruRef.current.filter((p) => p !== href && next.includes(p));
        router.push(mru[mru.length - 1] ?? next[next.length - 1] ?? "/dashboard");
      }
      return next;
    });
  }

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  }

  // Icons-only: the desktop choice, and never in the phone drawer.
  const iconsOnly = collapsed && !isPhone;

  // Pages whose own name contains what was typed. The registry is the list
  // of real pages (PAGE_REGISTRY), so this cannot drift from the nav the way
  // a second hand-written list would.
  const needle = foldForSearch(query.trim());
  // Matched against the page name **and** its group name, so "zamowienia"
  // finds everything under Zamówienia rather than only the one page whose
  // own title happens to contain the word.
  const results = needle
    ? PAGE_REGISTRY.map((page) => {
        const groupKey = pageGroupKey(page.href);
        return { ...page, label: tNav(page.key), group: groupKey ? tNav(groupKey) : "" };
      })
        .filter((page) => foldForSearch(page.label + " " + page.group).includes(needle))
        .slice(0, 8)
    : [];

  const openResult = useCallback(
    (i) => {
      const page = results[i];
      if (!page) return;
      setQuery("");
      router.push(page.href);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, router]
  );
  const searchKeys = useListKeyboard({
    length: results.length,
    onPick: openResult,
    onEscape: () => setQuery(""),
  });

  const stockChildren = [
    { href: "/dashboard/stock", label: tNav("currentStock") },
    { href: "/dashboard/stock/current", label: tNav("currentList") },
    { href: "/dashboard/stock/balance", label: tNav("balance") },
    { href: "/dashboard/stock/reports", label: tNav("reports") },
    { href: "/dashboard/stock/frp-database", label: tNav("frpDatabase") },
  ];

  const materialsChildren = [
    { href: "/dashboard/materials-list-cip", label: tNav("materialsList") },
    { href: "/dashboard/materials-list-cip/history-cip", label: tNav("materialsHistory") },
  ];

  const materialsSmChildren = [
    { href: "/dashboard/materials-list-sm", label: tNav("materialsListSm") },
    { href: "/dashboard/materials-list-sm/history-sm", label: tNav("materialsHistorySm") },
    { href: "/dashboard/materials-list-sm/catalog-sm", label: tNav("materialsCatalogSm") },
  ];

  const ordersTransportChildren = [
    { href: "/dashboard/orders/transport", label: tNav("ordersTransportList") },
    { href: "/dashboard/orders/transport/guidelines", label: tNav("ordersTransportGuidelines") },
    { href: "/dashboard/orders/transport/history", label: tNav("ordersTransportHistory") },
    { href: "/dashboard/orders/transport/login-history", label: tNav("ordersTransportLoginHistory") },
    { href: "/dashboard/orders/transport/reports", label: tNav("reports") },
    { href: "/dashboard/orders/transport/short-lengths", label: tNav("ordersTransportShortLengths") },
  ];

  const ordersMaterialsChildren = [
    { href: "/dashboard/orders/materials", label: tNav("ordersMaterialsSearch") },
  ];

  const ordersWmsChildren = [{ href: "/dashboard/orders/wms", label: tNav("ordersWmsLists") }];

  return (
    // h-dvh, not h-screen: on a phone h-screen is the *largest* viewport
    // height, so the bottom of the layout sits behind the browser's own bar
    // until it is scrolled away.
    <div className="h-dvh w-full overflow-hidden bg-gray-100 dark:bg-neutral-950">
      <div className="flex h-full w-full overflow-hidden bg-white dark:bg-neutral-900">
        {/* Dims the page behind the open drawer and closes it on a tap -
            mobile only, since there is no drawer at md and up. */}
        {navOpen && (
          <button
            type="button"
            aria-label={tNav("closeNav")}
            onClick={() => setNavOpen(false)}
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
          />
        )}
        <aside
          className={`z-50 flex shrink-0 flex-col border-r border-gray-200 bg-white p-4 transition-transform duration-200 dark:border-neutral-800 dark:bg-neutral-900 max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:w-72 md:static md:translate-x-0 md:transition-[width] ${
            navOpen ? "max-md:translate-x-0 max-md:shadow-2xl" : "max-md:-translate-x-full"
          } ${iconsOnly ? "md:w-[76px]" : "md:w-64"}`}
        >
          <div className="flex items-center justify-between gap-2 px-2 py-3">
            {!iconsOnly && (
              <span className="text-sm font-semibold text-navy-950 dark:text-white">Stock Manager</span>
            )}
            <button
              type="button"
              aria-label={tNav("closeNav")}
              onClick={() => setNavOpen(false)}
              className="cursor-pointer rounded-lg p-1 text-gray-500 hover:bg-navy-50 hover:text-navy-950 md:hidden dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-2 mb-2">
            {iconsOnly ? (
              <button
                type="button"
                title={tNav("search")}
                // Nothing to type into while collapsed, so this expands the
                // sidebar rather than being a decoration.
                onClick={toggleCollapsed}
                className="flex w-full cursor-pointer items-center justify-center rounded-xl px-3 py-2.5 text-gray-500 dark:text-neutral-400 transition-colors hover:bg-navy-50 dark:hover:bg-neutral-800 hover:text-navy-950 dark:hover:text-white"
              >
                <Search className="h-5 w-5 shrink-0" />
              </button>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-neutral-500" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={searchKeys.onKeyDown}
                  placeholder={tNav("searchPlaceholder")}
                  className="w-full rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 py-2 pl-9 pr-3 text-sm text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:border-navy-700 dark:focus:border-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400"
                />
                {query.trim() !== "" && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                    {results.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-gray-400 dark:text-neutral-500">{tNav("searchEmpty")}</p>
                    ) : (
                      results.map((page, i) => {
                        const Icon = page.icon;
                        return (
                          <button
                            key={page.href}
                            ref={(el) => searchKeys.registerRow(i, el)}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => openResult(i)}
                            onMouseEnter={() => searchKeys.setIndex(i)}
                            className={`flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-neutral-300 ${listRowClasses(
                              i === searchKeys.index
                            )}`}
                          >
                            <Icon className="h-4 w-4 shrink-0 text-gray-400 dark:text-neutral-500" />
                            <span className="truncate">{page.label}</span>
                            {page.group && (
                              <span className="ml-auto shrink-0 text-xs text-gray-400 dark:text-neutral-500">
                                {page.group}
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* min-h-0 overrides the flex item's default min-height:auto, which
              otherwise ignores flex-1 for scrolling purposes and just grows
              the whole <aside> past the viewport - pushing Zwiń nawigację/
              Wyloguj off-screen with nothing to scroll them back into view. */}
          <nav className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto">
            <Link
              href="/dashboard"
              title={iconsOnly ? tNav("home") : undefined}
              className={navLinkClasses(pathname === "/dashboard", iconsOnly)}
            >
              <Home className="h-5 w-5 shrink-0" />
              {!iconsOnly && tNav("home")}
            </Link>

            <NavGroup
              icon={Package}
              label={tNav("stock")}
              basePath={STOCK_BASE_PATH}
              pathname={pathname}
              collapsed={iconsOnly}
              open={stockOpen}
              onToggle={() => setStockOpen((prev) => !prev)}
              items={stockChildren}
            />

            <NavGroup
              icon={ClipboardList}
              label={tNav("materials")}
              basePath={MATERIALS_BASE_PATH}
              pathname={pathname}
              collapsed={iconsOnly}
              open={materialsOpen}
              onToggle={() => setMaterialsOpen((prev) => !prev)}
              items={materialsChildren}
            />

            <NavGroup
              icon={Boxes}
              label={tNav("materialsSm")}
              basePath={MATERIALS_SM_BASE_PATH}
              pathname={pathname}
              collapsed={iconsOnly}
              open={materialsSmOpen}
              onToggle={() => setMaterialsSmOpen((prev) => !prev)}
              items={materialsSmChildren}
            />

            <NavGroup
              icon={Truck}
              label={tNav("ordersTransport")}
              basePath={ORDERS_TRANSPORT_BASE_PATH}
              pathname={pathname}
              collapsed={iconsOnly}
              open={ordersTransportOpen}
              onToggle={() => setOrdersTransportOpen((prev) => !prev)}
              items={ordersTransportChildren}
            />

            <NavGroup
              icon={ShoppingCart}
              label={tNav("ordersMaterials")}
              basePath={ORDERS_MATERIALS_BASE_PATH}
              pathname={pathname}
              collapsed={iconsOnly}
              open={ordersMaterialsOpen}
              onToggle={() => setOrdersMaterialsOpen((prev) => !prev)}
              items={ordersMaterialsChildren}
            />

            <NavGroup
              icon={PackageMinus}
              label={tNav("ordersWms")}
              basePath={ORDERS_WMS_BASE_PATH}
              pathname={pathname}
              collapsed={iconsOnly}
              open={ordersWmsOpen}
              onToggle={() => setOrdersWmsOpen((prev) => !prev)}
              items={ordersWmsChildren}
            />

            {/* Flat, like Start: roles are not a section of anything - they
                are about people, and every other group here is about a kind
                of material or order. */}
            <Link
              href="/dashboard/permissions"
              title={iconsOnly ? tNav("permissions") : undefined}
              className={navLinkClasses(pathname.startsWith("/dashboard/permissions"), iconsOnly)}
            >
              <ShieldCheck className="h-5 w-5 shrink-0" />
              {!iconsOnly && tNav("permissions")}
            </Link>
          </nav>

          <button
            type="button"
            onClick={toggleCollapsed}
            title={iconsOnly ? tNav("expand") : tNav("collapse")}
            // Hidden below md: in a drawer there is nothing to collapse to,
            // the whole panel slides away instead.
            className={`mb-1 hidden cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-500 transition-colors hover:bg-navy-50 hover:text-navy-950 md:flex dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white ${
              iconsOnly ? "justify-center" : ""
            }`}
          >
            {iconsOnly ? (
              <PanelLeftOpen className="h-5 w-5 shrink-0" />
            ) : (
              <>
                <PanelLeftClose className="h-5 w-5 shrink-0" />
                {tNav("collapse")}
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              logoutCip().then(() => {
                router.push("/");
                router.refresh();
              });
            }}
            title={iconsOnly ? tDashboard("logout") : undefined}
            className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-600 dark:text-neutral-400 transition-colors hover:bg-navy-50 dark:hover:bg-neutral-800 hover:text-navy-950 dark:hover:text-white ${
              iconsOnly ? "justify-center" : ""
            }`}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {!iconsOnly && tDashboard("logout")}
          </button>
        </aside>

        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 md:px-6 md:py-4 dark:border-neutral-800">
            <button
              type="button"
              aria-label={tNav("openNav")}
              onClick={() => setNavOpen(true)}
              className="-ml-1 cursor-pointer rounded-lg p-2 text-gray-600 hover:bg-navy-50 hover:text-navy-950 md:hidden dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 flex-col leading-tight">
              {session?.username && (
                <span className="truncate text-sm font-semibold text-navy-950 dark:text-white">
                  {session.username}
                </span>
              )}
              {session?.userId && (
                <span className="truncate text-xs text-gray-500 dark:text-neutral-400">{session.userId}</span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ThemeToggle />
              <LanguageSwitcher />
            </div>
          </header>

          {mounted && recentPaths.length >= 1 && (
            <RecentTabsBar
              paths={recentPaths}
              setPaths={setRecentPaths}
              activePath={pathname}
              onCloseTab={handleCloseTab}
            />
          )}

          <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
