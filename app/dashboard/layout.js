"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLocalStorage } from "usehooks-ts";
import {
  Home,
  LogOut,
  Package,
  ClipboardList,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import RecentTabsBar from "@/components/RecentTabsBar";
import NavGroup from "@/components/NavGroup";
import { PAGE_REGISTRY, navLinkClasses } from "@/lib/dashboard-pages";
import { logoutCip, getCipSession } from "@/lib/cipSession";

const SIDEBAR_COLLAPSED_KEY = "wms-sidebar-collapsed";
const RECENT_PAGES_KEY = "wms-recent-pages";
const STOCK_BASE_PATH = "/dashboard/stock";
const MATERIALS_BASE_PATH = "/dashboard/materials-list";
const MAX_RECENT_PAGES = 5;
export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const tNav = useTranslations("nav");
  const tDashboard = useTranslations("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [stockOpen, setStockOpen] = useState(() => pathname.startsWith(STOCK_BASE_PATH));
  const [materialsOpen, setMaterialsOpen] = useState(() =>
    pathname.startsWith(MATERIALS_BASE_PATH)
  );
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

  const stockChildren = [
    { href: "/dashboard/stock", label: tNav("currentStock") },
    { href: "/dashboard/stock/current", label: tNav("currentList") },
    { href: "/dashboard/stock/balance", label: tNav("balance") },
    { href: "/dashboard/stock/reports", label: tNav("reports") },
    { href: "/dashboard/stock/frp-database", label: tNav("frpDatabase") },
  ];

  const materialsChildren = [
    { href: "/dashboard/materials-list", label: tNav("materialsList") },
    { href: "/dashboard/materials-list/history", label: tNav("materialsHistory") },
    { href: "/dashboard/materials-list/reports", label: tNav("reports") },
  ];

  return (
    <div className="h-screen w-full overflow-hidden bg-gray-100 dark:bg-neutral-950">
      <div className="flex h-full w-full overflow-hidden bg-white dark:bg-neutral-900">
        <aside
          className={`flex shrink-0 flex-col border-r border-gray-200 dark:border-neutral-800 p-4 transition-[width] duration-200 ${
            collapsed ? "w-[76px]" : "w-64"
          }`}
        >
          <div className="flex items-center gap-2 px-2 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy-950 dark:bg-navy-500 text-xs font-bold text-white">
              WMS
            </div>
            {!collapsed && (
              <span className="text-sm font-semibold text-navy-950 dark:text-white">WMS</span>
            )}
          </div>

          <div className="mt-2 mb-2">
            {collapsed ? (
              <button
                type="button"
                title={tNav("search")}
                className="flex w-full cursor-pointer items-center justify-center rounded-xl px-3 py-2.5 text-gray-500 dark:text-neutral-400 transition-colors hover:bg-navy-50 dark:hover:bg-neutral-800 hover:text-navy-950 dark:hover:text-white"
              >
                <Search className="h-5 w-5 shrink-0" />
              </button>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-neutral-500" />
                <input
                  type="search"
                  placeholder={tNav("searchPlaceholder")}
                  className="w-full rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 py-2 pl-9 pr-3 text-sm text-gray-900 dark:text-neutral-100 placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:border-navy-700 dark:focus:border-navy-400 focus:outline-none focus:ring-1 focus:ring-navy-700 dark:focus:ring-navy-400"
                />
              </div>
            )}
          </div>

          <nav className="mt-2 flex-1 space-y-1">
            <Link
              href="/dashboard"
              title={collapsed ? tNav("home") : undefined}
              className={navLinkClasses(pathname === "/dashboard", collapsed)}
            >
              <Home className="h-5 w-5 shrink-0" />
              {!collapsed && tNav("home")}
            </Link>

            <NavGroup
              icon={Package}
              label={tNav("stock")}
              basePath={STOCK_BASE_PATH}
              pathname={pathname}
              collapsed={collapsed}
              open={stockOpen}
              onToggle={() => setStockOpen((prev) => !prev)}
              items={stockChildren}
            />

            <NavGroup
              icon={ClipboardList}
              label={tNav("materials")}
              basePath={MATERIALS_BASE_PATH}
              pathname={pathname}
              collapsed={collapsed}
              open={materialsOpen}
              onToggle={() => setMaterialsOpen((prev) => !prev)}
              items={materialsChildren}
            />
          </nav>

          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? tNav("expand") : tNav("collapse")}
            className={`mb-1 flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-500 dark:text-neutral-400 transition-colors hover:bg-navy-50 dark:hover:bg-neutral-800 hover:text-navy-950 dark:hover:text-white ${
              collapsed ? "justify-center" : ""
            }`}
          >
            {collapsed ? (
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
            title={collapsed ? tDashboard("logout") : undefined}
            className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-600 dark:text-neutral-400 transition-colors hover:bg-navy-50 dark:hover:bg-neutral-800 hover:text-navy-950 dark:hover:text-white ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {!collapsed && tDashboard("logout")}
          </button>
        </aside>

        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="flex items-center justify-between gap-2 border-b border-gray-200 dark:border-neutral-800 px-6 py-4">
            <div className="flex flex-col leading-tight">
              {session?.username && (
                <span className="text-sm font-semibold text-navy-950 dark:text-white">{session.username}</span>
              )}
              {session?.userId && (
                <span className="text-xs text-gray-500 dark:text-neutral-400">{session.userId}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
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

          <main className="flex-1 overflow-auto p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
