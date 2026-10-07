"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import FrpFilters from "@/components/FrpFilters";
import { shortLengthsApi } from "@/lib/shortLengthsApi";

// "Transporty → Krótkie odcinki": every report a forklift operator made
// from inside a task, newest first.
//
// Read-only. The report is made in smVendor, standing at the material, and
// this is where it is read afterwards - so there is nothing to edit here
// and no action column.
//
// The photo is half the point (a remnant's real state is not something a
// quantity field can carry), so it gets a thumbnail in the row and opens
// full size in a new tab. Those links are **presigned and short-lived**
// (one hour - see wpsApi's orderPhotos.js): never cache or store one, just
// render what the last fetch returned.

const HEAD_CLS = "text-[11px] font-medium tracking-wide text-gray-400 dark:text-neutral-500";
const CELL_CLS = "text-gray-600 dark:text-neutral-300";

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value ?? "—";
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export default function ShortLengthsTable() {
  const t = useTranslations("shortLengths");
  const [reports, setReports] = useState([]);
  const [loadStatus, setLoadStatus] = useState("loading"); // loading | ready | error
  const [search, setSearch] = useState("");

  function reload() {
    setLoadStatus((prev) => (prev === "ready" ? prev : "loading"));
    shortLengthsApi
      .list()
      .then((rows) => {
        setReports(rows);
        setLoadStatus("ready");
      })
      .catch(() => setLoadStatus("error"));
  }

  useEffect(reload, []);

  const needle = search.trim().toLowerCase();
  const rows = useMemo(
    () =>
      needle
        ? reports.filter((r) =>
            [r.reportedBy, r.itemNo, r.itemName, r.orderNo, r.orderTo, r.quantity].some((field) =>
              String(field ?? "").toLowerCase().includes(needle)
            )
          )
        : reports,
    [reports, needle]
  );

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

      <div className="mt-3">
        <FrpFilters onGlobalFilterChange={setSearch} />
      </div>

      {loadStatus === "loading" && <p className="mt-4 text-sm text-gray-500 dark:text-neutral-400">{t("loading")}</p>}
      {loadStatus === "error" && <p className="mt-4 text-sm text-gray-500 dark:text-neutral-400">{t("loadError")}</p>}
      {loadStatus === "ready" && rows.length === 0 && (
        <p className="mt-4 text-sm text-gray-500 dark:text-neutral-400">{t("empty")}</p>
      )}

      {loadStatus === "ready" && rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={HEAD_CLS}>{t("colTime")}</TableHead>
                <TableHead className={HEAD_CLS}>{t("colOrder")}</TableHead>
                <TableHead className={HEAD_CLS}>{t("colEmployee")}</TableHead>
                <TableHead className={HEAD_CLS}>{t("colItem")}</TableHead>
                <TableHead className={HEAD_CLS}>{t("colQuantity")}</TableHead>
                <TableHead className={HEAD_CLS}>{t("colPhoto")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((report) => (
                <TableRow key={report.id}>
                  <TableCell className={CELL_CLS}>{formatDateTime(report.createdAt)}</TableCell>
                  <TableCell className={CELL_CLS}>
                    <span className="font-medium text-gray-900 dark:text-neutral-100">{report.orderNo}</span>
                    {report.orderTo && <span className="ml-2 text-xs">{report.orderTo}</span>}
                  </TableCell>
                  <TableCell className="font-medium text-gray-900 dark:text-neutral-100">
                    {report.reportedBy}
                  </TableCell>
                  <TableCell className={CELL_CLS}>
                    <div>{report.itemName || report.itemNo}</div>
                    {report.itemName && <div className="text-xs text-gray-400 dark:text-neutral-500">{report.itemNo}</div>}
                  </TableCell>
                  <TableCell className={CELL_CLS}>{report.quantity || "—"}</TableCell>
                  <TableCell>
                    {report.photos.length === 0 ? (
                      <span className="text-gray-400 dark:text-neutral-500">—</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        {report.photos.map((photo) => (
                          <a
                            key={photo.id}
                            href={photo.url}
                            target="_blank"
                            rel="noreferrer"
                            title={photo.name}
                            className="block h-12 w-12 overflow-hidden rounded-md border border-gray-200 dark:border-neutral-700"
                          >
                            {/* A plain <img>: these are presigned links to our
                                own MinIO, not a known-at-build-time host
                                next/image can be configured for. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={photo.url} alt={photo.name} className="h-full w-full object-cover" />
                          </a>
                        ))}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
