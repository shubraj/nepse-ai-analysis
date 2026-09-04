import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api/client";
import type { IndexPoint, Top30ConstituentItem } from "../types/company";

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

function formatMarketCap(n: number): string {
  if (n >= 1e9) return `Rs ${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `Rs ${(n / 1e6).toFixed(1)}M`;
  return `Rs ${n.toLocaleString()}`;
}

export function Top30Index() {
  const [allSeries, setAllSeries] = useState<IndexPoint[] | null>(null);
  const [constituents, setConstituents] = useState<Top30ConstituentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState(365);
  const [showConstituents, setShowConstituents] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getTop30Index(3650)
      .then((res) => {
        if (!cancelled) {
          setAllSeries(res.series);
          setConstituents(res.constituents);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load index");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const data = useMemo(() => {
    if (!allSeries) return [];
    return allSeries.slice(-range);
  }, [allSeries, range]);

  const { changePct, isUp, latestValue } = useMemo(() => {
    if (data.length < 2) return { changePct: null as number | null, isUp: true, latestValue: null as number | null };
    const first = data[0].value;
    const last = data[data.length - 1].value;
    if (!first) return { changePct: null, isUp: true, latestValue: last };
    const pct = ((last - first) / first) * 100;
    return { changePct: pct, isUp: pct >= 0, latestValue: last };
  }, [data]);

  if (loading) {
    return (
      <section className="surface-card rounded-3xl p-6">
        <div className="h-72 animate-pulse rounded-lg bg-stone-100" />
      </section>
    );
  }

  if (error || !allSeries || allSeries.length === 0) {
    return null;
  }

  const lineColor = isUp ? "#059669" : "#dc2626";

  return (
    <section className="surface-card rounded-3xl p-6">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-stone-900">NepseAI Top 30 Index</h2>
          <p className="mt-1 text-sm text-stone-500">
            Market-cap-weighted index of NEPSE&apos;s 30 largest listed companies, normalized to 100.
          </p>
        </div>
        <div className="flex flex-col items-end">
          {latestValue != null && (
            <span className="font-mono text-lg font-semibold text-stone-900">{latestValue.toFixed(2)}</span>
          )}
          {changePct != null && (
            <span className={`text-sm font-medium ${isUp ? "text-emerald-600" : "text-red-600"}`}>
              {isUp ? "+" : ""}
              {changePct.toFixed(2)}% over period
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-end">
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

      <div className="mt-3 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="top30-gradient" x1="0" y1="0" x2="0" y2="1">
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
              width={50}
            />
            <Tooltip
              formatter={(value) => [Number(value).toFixed(2), "Index"]}
              labelFormatter={(label) =>
                new Date(String(label)).toLocaleDateString(undefined, { dateStyle: "medium" })
              }
              contentStyle={{ borderRadius: 8, border: "1px solid #e7e5e4", fontSize: 13 }}
            />
            <Area type="monotone" dataKey="value" stroke={lineColor} strokeWidth={2} fill="url(#top30-gradient)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <button
        type="button"
        onClick={() => setShowConstituents((v) => !v)}
        className="mt-4 text-sm font-medium text-teal-600 hover:text-teal-700"
      >
        {showConstituents ? "Hide constituents ▲" : `Show ${constituents.length} constituents ▼`}
      </button>

      {showConstituents && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-stone-500">
                <th className="pb-2 pr-4 font-medium">#</th>
                <th className="pb-2 pr-4 font-medium">Symbol</th>
                <th className="pb-2 pr-4 font-medium">Sector</th>
                <th className="pb-2 pr-4 font-medium text-right">Market cap</th>
                <th className="pb-2 font-medium text-right">Weight</th>
              </tr>
            </thead>
            <tbody>
              {constituents.map((c, i) => (
                <tr key={c.symbol} className="border-b border-stone-100">
                  <td className="py-2 pr-4 text-stone-400">{i + 1}</td>
                  <td className="py-2 pr-4">
                    <Link to={`/company/${c.symbol}`} className="font-mono font-semibold text-teal-700 hover:underline">
                      {c.symbol}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-stone-600">{c.sector ?? "N/A"}</td>
                  <td className="py-2 pr-4 text-right text-stone-600">{formatMarketCap(c.market_cap)}</td>
                  <td className="py-2 text-right font-medium text-stone-800">{c.weight_pct.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
