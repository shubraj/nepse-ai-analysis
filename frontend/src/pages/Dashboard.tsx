import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useWatchlist } from "../contexts/WatchlistContext";
import type {
  Company,
  MarketPredictionResponse,
  MarketSentimentResponse,
  SectorPerformanceItem,
  SuggestionItem,
} from "../types/company";
import {
  getRiskTier,
  getRecommendation,
  riskTierLabel,
  recommendationLabel,
} from "../lib/screening";
import type { RiskTier, Recommendation } from "../lib/screening";

function CompanyCardRow({
  companies,
  loading,
}: {
  companies: Company[];
  loading: boolean;
}) {
  if (loading) return <p className="py-6 text-center text-stone-500">Loading…</p>;
  if (companies.length === 0) return <p className="py-4 text-sm text-stone-500">No companies in this category.</p>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {companies.slice(0, 6).map((c) => {
        const risk = getRiskTier(c.analysis as Record<string, unknown>);
        const rec = getRecommendation(c.analysis as Record<string, unknown>);
        return (
          <Link
            key={c.id}
            to={`/company/${c.symbol}`}
            className="flex flex-col rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm transition-shadow hover:border-teal-200 hover:shadow-md"
          >
            <div className="font-mono text-sm font-semibold text-teal-600">{c.symbol}</div>
            <div className="mt-0.5 text-sm font-medium text-stone-800 line-clamp-2">{c.name}</div>
            <div className="mt-1 text-xs text-stone-500">{c.sector ?? "N/A"}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {rec && (
                <span
                  className={`inline-flex items-center rounded-lg px-2.5 py-1 text-sm font-medium ${
                    rec === "consider" ? "bg-emerald-100 text-emerald-800" : rec === "avoid" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {recommendationLabel[rec as Recommendation]}
                </span>
              )}
              {risk && (
                <span
                  className={`inline-flex items-center rounded-lg px-2.5 py-1 text-sm font-medium ${
                    risk === "low" ? "bg-sky-100 text-sky-800" : risk === "high" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {riskTierLabel[risk as RiskTier]}
                </span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

const GOAL_OPTIONS: { value: "short_term" | "mid_term" | "long_term"; label: string }[] = [
  { value: "short_term", label: "Short term (0–12 months)" },
  { value: "mid_term", label: "Mid term (1–3 years)" },
  { value: "long_term", label: "Long term (3–5 years)" },
];

/** Set to true to show the Investment suggestion form and results. */
const SHOW_INVESTMENT_SUGGESTION = false;

function formatNpr(n: number) {
  return `NPR ${n.toLocaleString("en-NP")}`;
}

export function Dashboard() {
  const [mostInvestable, setMostInvestable] = useState<Company[]>([]);
  const [lowRisk, setLowRisk] = useState<Company[]>([]);
  const [highRisk, setHighRisk] = useState<Company[]>([]);
  const [timeToInvest, setTimeToInvest] = useState<Company[]>([]);
  const [waitForEntry, setWaitForEntry] = useState<Company[]>([]);
  const [marketSentiment, setMarketSentiment] = useState<MarketSentimentResponse | null>(null);
  const [marketPrediction, setMarketPrediction] = useState<MarketPredictionResponse | null>(null);
  const [sectorPerformance, setSectorPerformance] = useState<SectorPerformanceItem[]>([]);
  const [watchlistCompanies, setWatchlistCompanies] = useState<Company[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const { symbols: watchlistSymbols, toggle: toggleWatchlist } = useWatchlist();
  const [loading, setLoading] = useState(true);

  const [suggestAmount, setSuggestAmount] = useState("");
  const [suggestGoal, setSuggestGoal] = useState<"short_term" | "mid_term" | "long_term">("long_term");
  const [suggestMaxStocks, setSuggestMaxStocks] = useState(6);
  const [suggestions, setSuggestions] = useState<SuggestionItem[] | null>(null);
  const [expectedOverallReturnPct, setExpectedOverallReturnPct] = useState<number | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  // SEO: home page meta
  useEffect(() => {
    const title = "NEPSE Research – NEPSE Stock AI Analysis";
    const description =
      "Free AI-powered NEPSE stock analysis and screener for the Nepal stock market. Informational only, not investment advice.";
    document.title = title;
    const descEl = document.querySelector('meta[name="description"]');
    if (descEl) descEl.setAttribute("content", description);
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute("content", title);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute("content", description);
    const twTitle = document.querySelector('meta[name="twitter:title"]');
    if (twTitle) twTitle.setAttribute("content", title);
    const twDesc = document.querySelector('meta[name="twitter:description"]');
    if (twDesc) twDesc.setAttribute("content", description);
    const canonical = document.querySelector('link[rel="canonical"]');
    const url = `${window.location.origin}/`;
    if (canonical) canonical.setAttribute("href", url);
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute("content", url);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.getMarketSentiment().catch(() => null),
      api.getMarketPrediction().catch(() => null),
      api.getSectorPerformance().catch(() => ({ sectors: [] as SectorPerformanceItem[] })),
      api.listCompanies({ limit: 10, investability: "high" }),
      api.listCompanies({ limit: 10, risk_tier: "low" }),
      api.listCompanies({ limit: 10, risk_tier: "high" }),
      api.listCompanies({ limit: 10, entry_timing: "now" }),
      api.listCompanies({ limit: 10, entry_timing: "wait" }),
    ])
      .then(([sentiment, prediction, sectorResp, a, b, c, d, e]) => {
        if (!cancelled) {
          if (sentiment) setMarketSentiment(sentiment);
          if (prediction) setMarketPrediction(prediction);
          setSectorPerformance(sectorResp?.sectors ?? []);
          setMostInvestable(a);
          setLowRisk(b);
          setHighRisk(c);
          setTimeToInvest(d);
          setWaitForEntry(e);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (watchlistSymbols.length === 0) {
      setWatchlistCompanies([]);
      return;
    }
    setWatchlistLoading(true);
    Promise.all(watchlistSymbols.map((s) => api.getCompany(s).catch(() => null)))
      .then((list) => setWatchlistCompanies(list.filter((c): c is Company => c != null)))
      .finally(() => setWatchlistLoading(false));
  }, [watchlistSymbols]);

  const handleGetSuggestions = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseInt(suggestAmount.replace(/\D/g, ""), 10);
    if (!Number.isFinite(amount) || amount < 1000) {
      setSuggestError("Enter at least NPR 1,000.");
      setSuggestions(null);
      setExpectedOverallReturnPct(null);
      return;
    }
    setSuggestError(null);
    setSuggestLoading(true);
    setSuggestions(null);
    setExpectedOverallReturnPct(null);
    api
      .getSuggestions({ amount_npr: amount, goal: suggestGoal, max_stocks: suggestMaxStocks })
      .then((res) => {
        setSuggestions(res.suggestions);
        setExpectedOverallReturnPct(res.expected_overall_return_pct ?? null);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        setSuggestError(msg === "[object Object]" ? "Failed to load suggestions." : msg);
        setSuggestions(null);
        setExpectedOverallReturnPct(null);
      })
      .finally(() => {
        setSuggestLoading(false);
      });
  };

  return (
    <div className="space-y-10">
      <header className="rounded-2xl border border-stone-200/80 bg-white px-6 py-8 text-center shadow-sm sm:py-10">
        <h1 className="font-display text-2xl font-semibold text-stone-900 sm:text-3xl">NEPSE Equity Research</h1>
        <p className="mx-auto mt-2 max-w-xl text-stone-600">
          Company analysis, risk profile, and entry timing for the Nepal stock market.
        </p>
        <p className="mx-auto mt-3 max-w-xl text-xs text-stone-500">
          AI-based analysis from historical data. Not professional investment advice.
        </p>
        <Link
          to="/companies"
          className="mt-6 inline-block rounded-xl bg-teal-600 px-5 py-2.5 font-medium text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
        >
          Browse all companies
        </Link>
      </header>

      {marketSentiment && (
        <section className="rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-stone-900">Market sentiment</h2>
          <p className="mt-1 text-sm text-stone-500">
            Based on recent trend across analyzed stocks - not recommendations.
          </p>
          <div
            className={`mt-4 rounded-xl border p-5 ${
              marketSentiment.sentiment === "bullish"
                ? "border-emerald-200 bg-emerald-50/80"
                : marketSentiment.sentiment === "bearish"
                  ? "border-red-200 bg-red-50/80"
                  : marketSentiment.sentiment === "cautious"
                    ? "border-amber-200 bg-amber-50/80"
                    : marketSentiment.sentiment === "cautiously_optimistic"
                      ? "border-teal-200 bg-teal-50/80"
                      : "border-stone-200 bg-stone-50/80"
            }`}
          >
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                <span
                  className={`inline-flex w-fit items-center rounded-xl px-4 py-2 text-lg font-semibold ${
                    marketSentiment.sentiment === "bullish"
                      ? "bg-emerald-100 text-emerald-800"
                      : marketSentiment.sentiment === "bearish"
                        ? "bg-red-100 text-red-800"
                        : marketSentiment.sentiment === "cautious"
                          ? "bg-amber-100 text-amber-800"
                          : marketSentiment.sentiment === "cautiously_optimistic"
                            ? "bg-teal-100 text-teal-800"
                            : "bg-stone-100 text-stone-800"
                  }`}
                >
                  {marketSentiment.label}
                </span>
                {marketSentiment.stats.stocks_with_data > 0 ? (
                  <>
                    {marketSentiment.stats.avg_pct_change != null && (
                      <span className={marketSentiment.stats.avg_pct_change >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-red-600"}>
                        {marketSentiment.stats.avg_pct_change >= 0 ? "+" : ""}{marketSentiment.stats.avg_pct_change}% avg
                      </span>
                    )}
                    <span className="text-stone-600">{marketSentiment.stats.stocks_up} up</span>
                    <span className="text-stone-600">{marketSentiment.stats.stocks_down} down</span>
                    <span className="text-stone-500">· {marketSentiment.stats.stocks_with_data} stocks</span>
                  </>
                ) : (
                  <p className="text-sm text-stone-600">{marketSentiment.summary}</p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {marketPrediction && (
        <section className="rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-stone-900">Tomorrow&apos;s prediction</h2>
          <p className="mt-1 text-sm text-stone-500">
            AI prediction based on today&apos;s market data.
          </p>
          <div
            className={`mt-4 rounded-xl border p-5 ${
              marketPrediction.direction === "up"
                ? "border-emerald-200 bg-emerald-50/80"
                : marketPrediction.direction === "down"
                  ? "border-red-200 bg-red-50/80"
                  : "border-stone-200 bg-stone-50/80"
            }`}
          >
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <span
                  className={`inline-flex w-fit items-center rounded-xl px-4 py-2 text-lg font-semibold ${
                    marketPrediction.direction === "up"
                      ? "bg-emerald-100 text-emerald-800"
                      : marketPrediction.direction === "down"
                        ? "bg-red-100 text-red-800"
                        : "bg-stone-100 text-stone-800"
                  }`}
                >
                  {marketPrediction.direction === "up" ? "↑ Up" : marketPrediction.direction === "down" ? "↓ Down" : "→ Flat"}
                </span>
                {marketPrediction.predicted_change_pct && (
                  <span className={`font-semibold ${marketPrediction.direction === "up" ? "text-emerald-600" : marketPrediction.direction === "down" ? "text-red-600" : "text-stone-600"}`}>
                    {marketPrediction.predicted_change_pct}
                  </span>
                )}
                <span className="text-stone-600">Confidence: {marketPrediction.confidence}/10</span>
              </div>
              <p className="text-sm text-stone-700">{marketPrediction.summary}</p>
              {marketPrediction.key_factors?.length > 0 && (
                <div className="mt-2">
                  <span className="text-xs font-medium text-stone-500">Key factors:</span>
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {marketPrediction.key_factors.map((factor, i) => (
                      <li key={i} className="rounded-lg bg-white/80 px-2 py-1 text-xs text-stone-600">
                        {factor}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {sectorPerformance.length > 0 && (
        <section className="rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-stone-900">Sector performance</h2>
          <p className="mt-1 text-sm text-stone-500">Average price change by sector (recent trend).</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[320px] text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-stone-500">
                  <th className="pb-2 pr-4 font-medium">Sector</th>
                  <th className="pb-2 pr-4 font-medium text-right">Avg %</th>
                  <th className="pb-2 pr-4 font-medium text-right">Up</th>
                  <th className="pb-2 pr-4 font-medium text-right">Down</th>
                  <th className="pb-2 font-medium text-right">Stocks</th>
                </tr>
              </thead>
              <tbody>
                {sectorPerformance.slice(0, 12).map((row) => (
                  <tr key={row.sector} className="border-b border-stone-100">
                    <td className="py-2.5 pr-4 font-medium text-stone-800">{row.sector}</td>
                    <td className={`py-2.5 pr-4 text-right font-medium ${row.avg_pct_change >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {row.avg_pct_change >= 0 ? "+" : ""}{row.avg_pct_change}%
                    </td>
                    <td className="py-2.5 pr-4 text-right text-stone-600">{row.stocks_up}</td>
                    <td className="py-2.5 pr-4 text-right text-stone-600">{row.stocks_down}</td>
                    <td className="py-2.5 text-right text-stone-500">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link to="/companies" className="mt-3 inline-block text-sm font-medium text-teal-600 hover:text-teal-700">
            View all companies →
          </Link>
        </section>
      )}

      {watchlistSymbols.length > 0 && (
        <section className="rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-stone-900">Your watchlist</h2>
          <p className="mt-1 text-sm text-stone-500">Stocks you saved. Remove from watchlist on the company page.</p>
          {watchlistLoading ? (
            <p className="mt-4 text-sm text-stone-500">Loading…</p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {watchlistCompanies.map((c) => {
                const risk = getRiskTier(c.analysis as Record<string, unknown>);
                const rec = getRecommendation(c.analysis as Record<string, unknown>);
                return (
                  <div
                    key={c.id}
                    className="flex flex-col rounded-xl border border-stone-200/80 bg-stone-50/50 p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link to={`/company/${c.symbol}`} className="min-w-0 flex-1">
                        <div className="font-mono text-sm font-semibold text-teal-600">{c.symbol}</div>
                        <div className="mt-0.5 text-sm font-medium text-stone-800 line-clamp-2">{c.name}</div>
                        <div className="mt-1 text-xs text-stone-500">{c.sector ?? "N/A"}</div>
                      </Link>
                      <button
                        type="button"
                        onClick={() => toggleWatchlist(c.symbol)}
                        className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-stone-500 hover:bg-stone-200 hover:text-stone-800"
                        aria-label="Remove from watchlist"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {rec && (
                        <span
                          className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-medium ${
                            rec === "consider" ? "bg-emerald-100 text-emerald-800" : rec === "avoid" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {recommendationLabel[rec as Recommendation]}
                        </span>
                      )}
                      {risk && (
                        <span
                          className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-medium ${
                            risk === "low" ? "bg-sky-100 text-sky-800" : risk === "high" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {riskTierLabel[risk as RiskTier]}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {SHOW_INVESTMENT_SUGGESTION && (
        <section className="rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-stone-900">Investment suggestion</h2>
          <p className="mt-1 text-sm text-stone-500">
            Enter the amount you want to invest (NPR, min 1,000) and your goal. We&apos;ll suggest stocks to consider.
          </p>
          <form onSubmit={handleGetSuggestions} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-stone-500">Amount (NPR)</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="e.g. 50000"
                value={suggestAmount}
                onChange={(e) => setSuggestAmount(e.target.value.replace(/\D/g, ""))}
                className="w-40 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-stone-900 placeholder:text-stone-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-stone-500">Goal</span>
              <select
                value={suggestGoal}
                onChange={(e) => setSuggestGoal(e.target.value as "short_term" | "mid_term" | "long_term")}
                className="rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-stone-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              >
                {GOAL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-stone-500">Number of stocks</span>
              <select
                value={suggestMaxStocks}
                onChange={(e) => setSuggestMaxStocks(Number(e.target.value))}
                className="rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-stone-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={suggestLoading}
              className="rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-60"
            >
              {suggestLoading ? "Loading…" : "Get suggestions"}
            </button>
          </form>
          {suggestError && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p>{suggestError}</p>
              {suggestError.includes("Come back tomorrow") && (
                <a
                  href="https://buymeacoffee.com/shubraj"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block font-medium text-amber-700 underline hover:text-amber-800"
                >
                  Buy me a coffee ☕
                </a>
              )}
            </div>
          )}
          {suggestions !== null && suggestions.length === 0 && !suggestError && (
            <p className="mt-4 text-sm text-stone-500">No suggestions for this criteria. Try a different goal or check back after more companies are analysed.</p>
          )}
          {suggestions !== null && suggestions.length > 0 && (
            <div className="mt-6 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-semibold text-stone-700">Suggested allocation</h3>
                {expectedOverallReturnPct != null && (
                  <span className="rounded-lg bg-teal-100 px-2.5 py-1 text-sm font-medium text-teal-800">
                    Expected overall return: ~{expectedOverallReturnPct}% per year
                  </span>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {suggestions.map((s) => (
                  <Link
                    key={s.symbol}
                    to={`/company/${s.symbol}`}
                    className="flex flex-col rounded-xl border border-stone-200/80 bg-stone-50/50 p-4 transition-shadow hover:border-teal-200 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-mono text-sm font-semibold text-teal-600">{s.symbol}</div>
                      <div className="text-right">
                        <span className="block text-sm font-semibold text-stone-900">{formatNpr(s.suggested_amount_npr)}</span>
                        {s.expected_return_pct != null && (
                          <span className="text-xs text-stone-500">~{s.expected_return_pct}% /yr</span>
                        )}
                      </div>
                    </div>
                    <div className="mt-0.5 text-sm font-medium text-stone-800 line-clamp-2">{s.name}</div>
                    <div className="mt-1 text-xs text-stone-500">{s.sector || "N/A"}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${
                          s.recommendation === "consider" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {s.recommendation === "consider" ? "Consider" : "Watch"}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${
                          s.risk_tier === "low" ? "bg-sky-100 text-sky-800" : s.risk_tier === "high" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {s.risk_tier === "low" ? "Lower risk" : s.risk_tier === "high" ? "Higher risk" : "Moderate risk"}
                      </span>
                      {s.growth_potential && (
                        <span
                          className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium ${
                            s.growth_potential === "High" ? "bg-violet-100 text-violet-800" : s.growth_potential === "Moderate" ? "bg-slate-100 text-slate-700" : "bg-stone-100 text-stone-600"
                          }`}
                        >
                          {s.growth_potential === "High" ? "High growth" : s.growth_potential === "Moderate" ? "Moderate growth" : "Lower growth"}
                        </span>
                      )}
                    </div>
                    {s.outlook_label && (
                      <p className="mt-2 line-clamp-2 text-xs text-stone-500">{s.outlook_label}</p>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="font-display text-lg font-semibold text-stone-900">High conviction</h2>
        <p className="text-sm text-stone-500">High quality and conviction. Suitable for core allocation.</p>
        <CompanyCardRow companies={mostInvestable} loading={loading} />
        {mostInvestable.length > 0 && (
          <Link to="/companies?investability=high" className="mt-2 inline-block text-sm font-medium text-teal-600 hover:text-teal-700">
            View all →
          </Link>
        )}
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-stone-900">Lower risk</h2>
        <p className="text-sm text-stone-500">Lower risk profile. Suitable for conservative investors.</p>
        <CompanyCardRow companies={lowRisk} loading={loading} />
        {lowRisk.length > 0 && (
          <Link to="/companies?risk_tier=low" className="mt-2 inline-block text-sm font-medium text-teal-600 hover:text-teal-700">
            View all →
          </Link>
        )}
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-stone-900">Higher risk / return</h2>
        <p className="text-sm text-stone-500">Higher volatility and return potential. For risk-tolerant investors.</p>
        <CompanyCardRow companies={highRisk} loading={loading} />
        {highRisk.length > 0 && (
          <Link to="/companies?risk_tier=high" className="mt-2 inline-block text-sm font-medium text-teal-600 hover:text-teal-700">
            View all →
          </Link>
        )}
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-stone-900">Time to invest</h2>
        <p className="text-sm text-stone-500">Favorable entry timing. Consider accumulation.</p>
        <CompanyCardRow companies={timeToInvest} loading={loading} />
        {timeToInvest.length > 0 && (
          <Link to="/companies?entry_timing=now" className="mt-2 inline-block text-sm font-medium text-teal-600 hover:text-teal-700">
            View all →
          </Link>
        )}
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-stone-900">Wait for entry</h2>
        <p className="text-sm text-stone-500">Wait for better entry or more clarity before buying.</p>
        <CompanyCardRow companies={waitForEntry} loading={loading} />
        {waitForEntry.length > 0 && (
          <Link to="/companies?entry_timing=wait" className="mt-2 inline-block text-sm font-medium text-teal-600 hover:text-teal-700">
            View all →
          </Link>
        )}
      </section>
    </div>
  );
}
