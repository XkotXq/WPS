"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const LAST_N = 10;

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-gray-500 dark:text-neutral-400">{label}</p>
      <p className="mt-0.5 font-semibold text-gray-900 dark:text-neutral-100">
        {payload[0].value.toLocaleString("pl-PL", { maximumFractionDigits: 1 })} km
      </p>
    </div>
  );
}

// One item's own trend across (up to) its last 10 stock rounds — drawn
// entirely from data the page already loaded for the breakdown table
// (item.byDateKm), so selecting a row costs no extra request.
export default function ItemTrendChart({ item, dateColumns }) {
  const columns = dateColumns.slice(-LAST_N);
  const data = columns.map((col) => ({
    label: col.label,
    km: Math.round((item.byDateKm[col.key] ?? 0) * 10) / 10,
  }));

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="itemTrendFill" x1="0" y1="0" x2="0" y2="1">
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
          />
          <YAxis
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={68}
            tickFormatter={(v) => `${v.toLocaleString("pl-PL")} km`}
          />
          <Tooltip content={<TrendTooltip />} cursor={{ stroke: "var(--border)" }} />
          <Area
            type="monotone"
            dataKey="km"
            stroke="var(--primary)"
            strokeWidth={2}
            fill="url(#itemTrendFill)"
            dot={{ r: 4, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
