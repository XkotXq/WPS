"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

function TrendTooltip({ active, payload, label, unitLabel }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-gray-500 dark:text-neutral-400">{label}</p>
      <p className="mt-0.5 font-semibold text-gray-900 dark:text-neutral-100">
        {payload[0].value.toLocaleString("pl-PL", { maximumFractionDigits: 1 })} {unitLabel}
      </p>
    </div>
  );
}

// Single series ("total length over time" for whichever material is
// selected) - per the dataviz method a lone series carries no legend box
// (the title already names it) and stays in one hue, here the app's own
// --primary token so it tracks light/dark automatically.
export default function MaterialTrendChart({ title, points }) {
  const data = points.map((p) => ({ label: p.label, totalKm: Math.round(p.totalKm * 10) / 10 }));

  return (
    <div className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <p className="text-sm font-semibold text-gray-700 dark:text-neutral-200">{title}</p>
      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="materialTrendFill" x1="0" y1="0" x2="0" y2="1">
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
            <Tooltip content={<TrendTooltip unitLabel="km" />} cursor={{ stroke: "var(--border)" }} />
            <Area
              type="monotone"
              dataKey="totalKm"
              stroke="var(--primary)"
              strokeWidth={2}
              fill="url(#materialTrendFill)"
              dot={{ r: 4, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 }}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
