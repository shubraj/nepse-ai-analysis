import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api/client";
import type { PricePoint } from "../types/company";

const RANGES: { label: string; days: number }[] = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
  { label: "3Y", days: 1095 },
  { label: "All", days: 3650 },
];

function formatDate(d: string): string {
  const dt = new Date(d);
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function PriceChart({ symbol }: { symbol: string }) {
  const [allData, setAllData] = useState<PricePoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState(365);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getPriceHistory(symbol, 3650)
      .then((data) => {
        if (!cancelled) setAllData(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load price history");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const data = useMemo(() => {
    if (!allData) return [];
    return allData.slice(-range);
  }, [allData, range]);

  const { changePct, isUp } = useMemo(() => {
    if (data.length < 2) return { changePct: null as number | null, isUp: true };
    const first = data[0].close;
    const last = data[data.length - 1].close;
    if (!first) return { changePct: null, isUp: true };
    const pct = ((last - first) / first) * 100;
    return { changePct: pct, isUp: pct >= 0 };
  }, [data]);

  if (loading) {
    return (
      <div className="surface-card rounded-2xl p-5 sm:p-6">
        <div className="h-64 animate-pulse rounded-lg bg-stone-100" />
      </div>
    );
  }

  if (error || !allData || allData.length === 0) {
    return null;
  }

  const lineColor = isUp ? "#059669" : "#dc2626";
  const gradientId = `price-gradient-${symbol}`;

  return (
    <div className="surface-card rounded-2xl p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-base font-semibold text-stone-800">Price history</h2>
          {changePct != null && (
            <span className={`text-sm font-medium ${isUp ? "text-emerald-600" : "text-red-600"}`}>
              {isUp ? "+" : ""}
              {changePct.toFixed(2)}%
            </span>
          )}
        </div>
        <div className="flex gap-1 rounded-lg border border-stone-200 bg-stone-50 p-1">
          {RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setRange(r.days)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                range === r.days
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-700"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={lineColor} stopOpacity={0.25} />
                <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 11, fill: "#78716c" }}
              tickLine={false}
              axisLine={{ stroke: "#e7e5e4" }}
              minTickGap={40}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fontSize: 11, fill: "#78716c" }}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) => `Rs ${v.toLocaleString()}`}
            />
            <Tooltip
              formatter={(value) => [`Rs ${Number(value).toLocaleString("en-NP", { minimumFractionDigits: 2 })}`, "Close"]}
              labelFormatter={(label) =>
                new Date(String(label)).toLocaleDateString(undefined, { dateStyle: "medium" })
              }
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e7e5e4",
                fontSize: 13,
              }}
            />
            <Area
              type="monotone"
              dataKey="close"
              stroke={lineColor}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
