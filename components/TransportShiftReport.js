"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ordersApi } from "@/lib/ordersApi";

// "Transporty → Raporty": how a shift's transport work went.
//
// Table-first on purpose. The obvious shape for this is four big metric
// tiles across the top, and it is the wrong one here: the question this
// page answers is comparative ("which shift, which operator, against what")
// and a tile shows one number with nothing to compare it to. The same
// reason the rest of this dashboard is tables.
//
// Everything is credited to the shift that **delivered** the order, not the
// one that happened to be on duty when the requester confirmed it - see
// wpsapi's orderReports.js for why, and for what happens to a delivery that
// was rejected.

const RANGES = [
  { key: "today", days: 0 },
  { key: "week", days: 6 },
  { key: "month", days: 29 },
];

const HEAD_CLS = "text-[11px] font-medium tracking-wide text-gray-400 dark:text-neutral-500";
const NUM_CLS = "tabular-nums text-gray-900 dark:text-neutral-100";
const MUTED_CLS = "text-gray-500 dark:text-neutral-400";

// One hue, three values: the split is a difference in quantity, not in
// kind, so two operators do not get two unrelated colours.
const SEGMENT_TONES = ["bg-navy-700 dark:bg-navy-400", "bg-navy-400 dark:bg-navy-600", "bg-navy-300 dark:bg-navy-700"];

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function rangeDates(days) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: isoDay(from), to: isoDay(to) };
}

function formatDay(iso) {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

// Seconds are what the API sends; nobody reads a transport in seconds past
// about a minute and a half.
function formatDuration(seconds, dash) {
  if (seconds === null || seconds === undefined) return dash;
  if (seconds < 90) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

function formatPercent(value) {
  return `${new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(value)}%`;
}

/** The operators' shares of one shift, which always add up to 100. */
function OperatorSplit({ operators, dash }) {
  if (operators.length === 0) return <span className={MUTED_CLS}>{dash}</span>;
  return (
    <div className="min-w-[180px]">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-neutral-800">
        {operators.map((op, i) => (
          <div
            key={op.employeeNo}
            className={SEGMENT_TONES[i % SEGMENT_TONES.length]}
            style={{ width: `${op.sharePercent}%` }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {operators.map((op, i) => (
          <span key={op.employeeNo} className="inline-flex items-center gap-1.5 text-xs">
            <span className={`h-2 w-2 shrink-0 rounded-full ${SEGMENT_TONES[i % SEGMENT_TONES.length]}`} />
            <span className="text-gray-700 dark:text-neutral-200">{op.employeeNo}</span>
            <span className={`tabular-nums ${MUTED_CLS}`}>
              {op.delivered} · {formatPercent(op.sharePercent)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** A ranked list with the bar drawn behind the row - types, places. */
function RankedList({ rows, labelFor, dash }) {
  if (rows.length === 0) return <p className={`text-sm ${MUTED_CLS}`}>{dash}</p>;
  const max = Math.max(...rows.map((r) => r.delivered));
  return (
    <ul className="space-y-1.5">
      {rows.map((row) => (
        <li key={row.key} className="relative overflow-hidden rounded-md">
          <div
            className="absolute inset-y-0 left-0 bg-navy-50 dark:bg-navy-950/50"
            style={{ width: `${max === 0 ? 0 : (row.delivered / max) * 100}%` }}
          />
          <div className="relative flex items-center justify-between gap-3 px-2.5 py-1.5">
            <span className="truncate text-sm text-gray-700 dark:text-neutral-200">{labelFor(row)}</span>
            <span className={`text-sm font-medium ${NUM_CLS}`}>{row.delivered}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Panel({ title, children }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-neutral-200">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function TransportShiftReport() {
  const t = useTranslations("ordersTransportReports");
  const tTypes = useTranslations("ordersTransport.types");
  const [rangeKey, setRangeKey] = useState("week");
  const [report, setReport] = useState(null);
  const [loadStatus, setLoadStatus] = useState("loading"); // loading | ready | error

  const range = useMemo(() => rangeDates(RANGES.find((r) => r.key === rangeKey).days), [rangeKey]);

  useEffect(() => {
    let cancelled = false;
    setLoadStatus((prev) => (prev === "ready" ? prev : "loading"));
    ordersApi
      .shiftReport(range.from, range.to)
      .then((data) => {
        if (cancelled) return;
        setReport(data);
        setLoadStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setLoadStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to]);

  const dash = "—";
  // Across the whole period, not per shift: the same person works more than
  // one shift in a week, and this is the only place that adds them up.
  const operatorTotals = useMemo(() => {
    if (!report) return [];
    const totals = new Map();
    for (const shift of report.shifts) {
      for (const op of shift.operators) {
        totals.set(op.employeeNo, (totals.get(op.employeeNo) ?? 0) + op.delivered);
      }
    }
    return [...totals.entries()]
      .map(([employeeNo, delivered]) => ({ key: employeeNo, employeeNo, delivered }))
      .sort((a, b) => b.delivered - a.delivered);
  }, [report]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 dark:border-neutral-800">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRangeKey(r.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                rangeKey === r.key
                  ? "bg-navy-700 text-white dark:bg-navy-400 dark:text-navy-950"
                  : "text-gray-600 hover:bg-gray-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              {t(`range.${r.key}`)}
            </button>
          ))}
        </div>
        <p className={`text-sm ${MUTED_CLS}`}>
          {formatDay(range.from)} – {formatDay(range.to)}
          {report ? ` · ${t("deliveredTotal", { count: report.delivered })}` : ""}
        </p>
      </div>

      {loadStatus === "error" && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          <span>{t("loadError")}</span>
          <Button size="sm" variant="outline" onClick={() => setRangeKey((k) => k)}>
            {t("retry")}
          </Button>
        </div>
      )}

      {loadStatus === "loading" && <p className={`text-sm ${MUTED_CLS}`}>{t("loading")}</p>}

      {report && (
        <>
          <Panel title={t("shiftsHeading")}>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={HEAD_CLS}>{t("colShift")}</TableHead>
                    <TableHead className={HEAD_CLS}>{t("colDelivered")}</TableHead>
                    <TableHead className={HEAD_CLS}>{t("colShare")}</TableHead>
                    <TableHead className={HEAD_CLS}>{t("colSplit")}</TableHead>
                    <TableHead className={HEAD_CLS}>{t("colReaction")}</TableHead>
                    <TableHead className={HEAD_CLS}>{t("colHaul")}</TableHead>
                    <TableHead className={HEAD_CLS}>{t("colConfirm")}</TableHead>
                    <TableHead className={HEAD_CLS}>{t("colProblems")}</TableHead>
                    <TableHead className={HEAD_CLS}>{t("colCancelled")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.shifts.map((shift) => (
                    <TableRow key={shift.code}>
                      <TableCell className="font-semibold text-gray-900 dark:text-neutral-100">{shift.code}</TableCell>
                      <TableCell>
                        <span className={`text-base font-semibold ${NUM_CLS}`}>{shift.delivered}</span>
                        {shift.awaitingAccept > 0 && (
                          <span className={`ml-2 text-xs ${MUTED_CLS}`}>
                            {t("awaitingAccept", { count: shift.awaitingAccept })}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className={NUM_CLS}>{formatPercent(shift.sharePercent)}</TableCell>
                      <TableCell>
                        <OperatorSplit operators={shift.operators} dash={dash} />
                      </TableCell>
                      <TableCell className={NUM_CLS}>{formatDuration(shift.reactionMedianSeconds, dash)}</TableCell>
                      <TableCell className={NUM_CLS}>{formatDuration(shift.haulMedianSeconds, dash)}</TableCell>
                      <TableCell className={NUM_CLS}>{formatDuration(shift.confirmMedianSeconds, dash)}</TableCell>
                      <TableCell className={NUM_CLS}>{shift.ordersWithProblem}</TableCell>
                      <TableCell className={NUM_CLS}>{shift.cancelled}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Panel>

          <div className="grid gap-5 md:grid-cols-3">
            <Panel title={t("operatorsHeading")}>
              <RankedList rows={operatorTotals} labelFor={(row) => row.employeeNo} dash={dash} />
            </Panel>
            <Panel title={t("typesHeading")}>
              <RankedList
                rows={report.types.map((row) => ({ ...row, key: row.type }))}
                labelFor={(row) => tTypes(row.type)}
                dash={dash}
              />
            </Panel>
            <Panel title={t("placesHeading")}>
              <RankedList
                rows={report.places.map((row) => ({ ...row, key: row.place }))}
                labelFor={(row) => row.place}
                dash={dash}
              />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
