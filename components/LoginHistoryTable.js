"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import FrpFilters from "@/components/FrpFilters";
import { loginEventsApi } from "@/lib/loginEventsApi";

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "medium" }).format(date);
}

const HEAD_CLS = "sticky top-0 z-10 bg-gray-50 text-[11px] font-medium tracking-wide text-gray-400 dark:bg-neutral-800 dark:text-neutral-500";
const CELL_CLS = "text-gray-600 dark:text-neutral-300";

// "Historia logowania" - which forklift ("wózek") an operator logged in
// on, and when - see wpsapi's login_events/loginEventsApi.js. Flat,
// read-only list (nothing to expand/edit) - only smpda logins ever appear
// here, since a wps/stock browser login never sends a deviceLabel.
export default function LoginHistoryTable() {
  const t = useTranslations("ordersTransportLoginHistory");
  const [search, setSearch] = useState("");
  const [events, setEvents] = useState([]);
  const [loadStatus, setLoadStatus] = useState("loading"); // loading | ready | error

  function reload() {
    setLoadStatus((prev) => (prev === "ready" ? prev : "loading"));
    loginEventsApi
      .list()
      .then((rows) => {
        setEvents(rows);
        setLoadStatus("ready");
      })
      .catch(() => setLoadStatus("error"));
  }

  useEffect(reload, []);

  const needle = search.trim().toLowerCase();
  const rows = needle
    ? events.filter((e) => [e.employeeNo, e.deviceLabel].some((field) => field?.toLowerCase().includes(needle)))
    : events;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-neutral-400">{t("count", { count: rows.length })}</p>
        {loadStatus === "error" && (
          <Button size="sm" variant="outline" onClick={reload}>
            {t("retry")}
          </Button>
        )}
      </div>

      <div className="mt-4">
        <FrpFilters onGlobalFilterChange={setSearch} />

        {loadStatus === "error" ? (
          <p className="rounded-lg border border-dashed border-red-200 dark:border-red-900/50 py-8 text-center text-sm text-red-600 dark:text-red-400">
            {t("loadError")}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-neutral-800">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800 hover:bg-gray-50 dark:hover:bg-neutral-800">
                  <TableHead className={`pl-4 ${HEAD_CLS}`}>{t("columns.employeeNo")}</TableHead>
                  <TableHead className={HEAD_CLS}>{t("columns.deviceLabel")}</TableHead>
                  <TableHead className={`pr-4 ${HEAD_CLS}`}>{t("columns.loggedInAt")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-sm text-gray-400 dark:text-neutral-500">
                      {t(loadStatus === "loading" ? "loading" : "empty")}
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className={`pl-4 font-medium ${CELL_CLS}`}>{event.employeeNo}</TableCell>
                    <TableCell className={CELL_CLS}>{event.deviceLabel}</TableCell>
                    <TableCell className={`pr-4 ${CELL_CLS}`}>{formatDateTime(event.loggedInAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
