"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { navLinkClasses } from "@/lib/dashboard-pages";

export default function NavGroup({
  icon: Icon,
  label,
  basePath,
  pathname,
  collapsed,
  open,
  onToggle,
  items,
}) {
  const active = pathname.startsWith(basePath);

  if (collapsed) {
    return (
      <Link href={basePath} title={label} className={navLinkClasses(active, collapsed)}>
        <Icon className="h-5 w-5 shrink-0" />
      </Link>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={navLinkClasses(false, collapsed) + " w-full"}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="mt-1 ml-4 space-y-0.5 border-l border-gray-200 dark:border-neutral-700 pl-3">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                pathname === item.href
                  ? "bg-navy-50 dark:bg-navy-500/15 text-navy-950 dark:text-white font-semibold"
                  : "text-gray-600 dark:text-neutral-400 hover:bg-gray-100 dark:hover:bg-neutral-800 hover:text-navy-950 dark:hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
