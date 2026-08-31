"use client";

import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

function CountTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-gray-500 dark:text-neutral-400">{label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="mt-0.5 flex items-center gap-1.5 font-semibold text-gray-900 dark:text-neutral-100">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

// 2-3 series (a fixed-order categorical set, e.g. frp's mmc/standard,
// coatedFrp's XB/Z, filler's GRAY/WHITE/BLACK - see `series` prop) - the
// legend doubles as a toggle: click an entry to hide/show that series,
// per the interactive-legend pattern for a >=2-series chart.
export default function MaterialDrumCountChart({ title, points, series }) {
  const [hidden, setHidden] = useState(() => new Set());

  const data = points.map((p) => {
    const row = { label: p.label };
    for (const s of series) row[s.key] = p.splitCounts[s.key] ?? 0;
    return row;
  });

  function toggle(dataKey) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(dataKey)) next.delete(dataKey);
      else next.add(dataKey);
      return next;
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4">
      <p className="text-sm font-semibold text-gray-700 dark:text-neutral-200">{title}</p>
      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
              width={40}
              allowDecimals={false}
            />
            <Tooltip content={<CountTooltip />} cursor={{ stroke: "var(--border)" }} />
            <Legend
              verticalAlign="top"
              align="right"
              height={28}
              iconType="circle"
              onClick={(entry) => toggle(entry.dataKey)}
              formatter={(value, entry) => (
                <span
                  className={`cursor-pointer text-xs ${
                    hidden.has(entry.dataKey) ? "text-gray-400 dark:text-neutral-600 line-through" : "text-gray-600 dark:text-neutral-300"
                  }`}
                >
                  {value}
                </span>
              )}
            />
            {series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                fill={s.color}
                fillOpacity={0.1}
                hide={hidden.has(s.key)}
                dot={{ r: 4, fill: s.color, stroke: "var(--card)", strokeWidth: 2 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
