"use client";

import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useTranslations } from "next-intl";

const OPERATION_LABEL_KEYS = { receipt: "operationIn", issue: "operationOut", labeling: "operationLabeling" };

// "YYYY-MM-DD HH:mm" - same idea as SmMaterialsHistoryTable's own
// formatTime, just without seconds (this is an axis label, not a table
// column - seconds would only add noise).
function formatLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function TrendTooltip({ active, payload, label }) {
  const t = useTranslations("materialsHistorySm");
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-gray-500 dark:text-neutral-400">{label}</p>
      <p className="mt-0.5 font-semibold text-gray-900 dark:text-neutral-100">
        {point.qty.toLocaleString("pl-PL", { maximumFractionDigits: 3 })}
      </p>
      <p className="mt-1 text-gray-500 dark:text-neutral-400">
        {t(OPERATION_LABEL_KEYS[point.operation] ?? "operationIn")} {point.delta}
        {point.operator ? ` · ${point.operator}` : ""}
      </p>
    </div>
  );
}

// Turns one item's raw sm_operations rows (oldest first - see
// smItemsApi.js's history()) into a running-balance trend line. Unlike
// Historia operacji CIP (whose own rows already carry the resulting
// quantity, computed by CIP itself), sm_operations only ever logs a
// signed delta - the balance here is summed client-side: receipt adds,
// issue subtracts, labeling is skipped entirely (it moves stock from
// pendingQuantity into a numbered unit, it doesn't change how much is
// actually on hand - see AGENTS.md's "Materiały SM" section). Cheap to do
// on every open since one item's own operation count is always small.
export default function SmMaterialStockChart({ operations }) {
  const data = useMemo(() => {
    let running = 0;
    return operations
      .filter((op) => op.operation !== "labeling")
      .map((op) => {
        const delta = parseFloat(op.quantity) || 0;
        running += op.operation === "issue" ? -delta : delta;
        return {
          label: formatLabel(op.time),
          qty: Math.round(running * 1000) / 1000,
          operation: op.operation,
          delta: op.operation === "issue" ? `-${op.quantity}` : `+${op.quantity}`,
          operator: op.operator,
        };
      });
  }, [operations]);

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="smStockTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.12} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={68}
            tickFormatter={(v) => v.toLocaleString("pl-PL")}
          />
          <Tooltip content={<TrendTooltip />} cursor={{ stroke: "var(--border)" }} />
          <Area
            type="stepAfter"
            dataKey="qty"
            stroke="var(--primary)"
            strokeWidth={2}
            fill="url(#smStockTrendFill)"
            dot={{ r: 3, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
