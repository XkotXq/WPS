"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useTranslations } from "next-intl";

function TrendTooltip({ active, payload, label }) {
  const t = useTranslations("materialsHistory");
  const tColumns = useTranslations("stock.columns");
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-gray-500 dark:text-neutral-400">{label}</p>
      <p className="mt-0.5 font-semibold text-gray-900 dark:text-neutral-100">
        {payload[0].value.toLocaleString("pl-PL", { maximumFractionDigits: 2 })}
      </p>
      {point?.operation && (
        <p className="mt-1 text-gray-500 dark:text-neutral-400">
          {point.operation === "InStorage" ? t("operationIn") : t("operationOut")}
          {point.amount !== "" && point.amount != null
            ? ` ${Number(point.amount).toLocaleString("pl-PL", { maximumFractionDigits: 2 })}`
            : ""}
          {point.operator ? ` · ${tColumns("historyOperator")}: ${point.operator}` : ""}
        </p>
      )}
    </div>
  );
}

// Draws one item's quantity over time straight from its own operation-
// history rows - each row already carries specificationsAfter (the item's
// running quantity right after that operation), so sorted-by-time rows
// are already the trend line; no delta summing needed.
export default function MaterialHistoryTrendChart({ data }) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="historyTrendFill" x1="0" y1="0" x2="0" y2="1">
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
            type="monotone"
            dataKey="qty"
            stroke="var(--primary)"
            strokeWidth={2}
            fill="url(#historyTrendFill)"
            dot={{ r: 3, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
