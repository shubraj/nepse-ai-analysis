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
import type { DividendEvent, PricePoint } from "../types/company";

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

const INVEST_AMOUNT = 100000;

function formatNpr(n: number): string {
  return `Rs ${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/**
 * Simulates reinvesting each cash dividend into new shares at the nearest
 * available close on/after its (approximate, fiscal-year-end) date.
 * Bonus/rights shares are not modeled — Merolagani's own bonus-history data
 * is too sparse per company to be a reliable basis for that adjustment.
 */
function simulateReinvested(
  data: PricePoint[],
  dividends: DividendEvent[],
  investAmount: number
): { finalValue: number; dividendCount: number } | null {
  if (data.length < 2 || !data[0].close) return null;
  let shares = investAmount / data[0].close;
  const startDate = data[0].date;
  const endDate = data[data.length - 1].date;
  const inRange = dividends
    .filter((d) => d.date >= startDate && d.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  let di = 0;
  for (const point of data) {
    while (di < inRange.length && inRange[di].date <= point.date) {
      const cash = shares * inRange[di].amount_per_share;
      shares += cash / point.close;
      di += 1;
    }
  }
  const lastClose = data[data.length - 1].close;
  return { finalValue: shares * lastClose, dividendCount: inRange.length };
}

export function PriceChart({ symbol }: { symbol: string }) {
  const [allData, setAllData] = useState<PricePoint[] | null>(null);
  const [dividends, setDividends] = useState<DividendEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState(365);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      api.getPriceHistory(symbol, 3650),
      api.getDividends(symbol).catch(() => []),
    ])
      .then(([priceData, divData]) => {
        if (!cancelled) {
          setAllData(priceData);
          setDividends(divData);
        }
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

  const { changePct, isUp, startDate, endDate } = useMemo(() => {
    if (data.length < 2)
      return {
        changePct: null as number | null,
        isUp: true,
        startDate: null as string | null,
        endDate: null as string | null,
      };
    const first = data[0].close;
    const last = data[data.length - 1].close;
    if (!first) return { changePct: null, isUp: true, startDate: null, endDate: null };
    const pct = ((last - first) / first) * 100;
    return { changePct: pct, isUp: pct >= 0, startDate: data[0].date, endDate: data[data.length - 1].date };
  }, [data]);

  const investedValue = changePct != null ? INVEST_AMOUNT * (1 + changePct / 100) : null;

  const reinvested = useMemo(() => simulateReinvested(data, dividends, INVEST_AMOUNT), [data, dividends]);
  const reinvestedChangePct = reinvested ? ((reinvested.finalValue - INVEST_AMOUNT) / INVEST_AMOUNT) * 100 : null;

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

      {investedValue != null && startDate && endDate && (
        <div className="mb-4 rounded-xl border border-stone-200 bg-stone-50/70 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-stone-500">
            If you invested {formatNpr(INVEST_AMOUNT)} on{" "}
            {new Date(startDate).toLocaleDateString(undefined, { dateStyle: "medium" })}, worth today (
            {new Date(endDate).toLocaleDateString(undefined, { dateStyle: "medium" })})
          </p>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
            <span className="text-sm text-stone-600">Price only</span>
            <div className="flex items-baseline gap-2">
              <span className={`font-display text-xl font-bold ${isUp ? "text-emerald-600" : "text-red-600"}`}>
                {formatNpr(investedValue)}
              </span>
              {changePct != null && (
                <span className={`text-sm font-medium ${isUp ? "text-emerald-600" : "text-red-600"}`}>
                  ({isUp ? "+" : ""}
                  {changePct.toFixed(2)}%)
                </span>
              )}
            </div>
          </div>

          {reinvested && reinvestedChangePct != null && (
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-stone-200/80 pt-1.5">
              <span className="text-sm text-stone-600">
                With dividends reinvested
                {reinvested.dividendCount > 0 ? ` (${reinvested.dividendCount} payout${reinvested.dividendCount > 1 ? "s" : ""})` : ""}
              </span>
              <div className="flex items-baseline gap-2">
                <span className={`font-display text-xl font-bold ${reinvestedChangePct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {formatNpr(reinvested.finalValue)}
                </span>
                <span className={`text-sm font-medium ${reinvestedChangePct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  ({reinvestedChangePct >= 0 ? "+" : ""}
                  {reinvestedChangePct.toFixed(2)}%)
                </span>
              </div>
            </div>
          )}
          <p className="mt-2 text-[11px] text-stone-400">
            Dividend dates are approximate (fiscal-year-end). Bonus/right shares aren&apos;t included — reliable historical data isn&apos;t available for most companies.
          </p>
        </div>
      )}

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
              formatter={(value) => [`Rs ${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, "Close"]}
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
