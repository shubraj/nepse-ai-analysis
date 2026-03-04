import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { Company } from "../types/company";
import {
  getRiskTier,
  getInvestability,
  getEntryTiming,
  riskTierLabel,
  investabilityLabel,
  entryTimingLabel,
} from "../lib/screening";
import type { RiskTier, Investability, EntryTiming } from "../lib/screening";

export function CompanyList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");

  const risk_tier = searchParams.get("risk_tier") || undefined;
  const investability = searchParams.get("investability") || undefined;
  const entry_timing = searchParams.get("entry_timing") || undefined;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .listCompanies({
        limit: 500,
        q: search || undefined,
        risk_tier,
        investability,
        entry_timing,
      })
      .then((data) => {
        if (!cancelled) setCompanies(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
  }, [search, risk_tier, investability, entry_timing]);

  const withAnalysis = companies.filter((c) => c.analysis).length;

  const setFilter = (key: "risk_tier" | "investability" | "entry_timing", value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  };

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold text-stone-900">Company screener</h1>
      <p className="text-sm text-stone-500">Filter and search NEPSE companies by risk, investability, and entry timing. Analysis is AI-based on historical data and is not professional investment advice.</p>

      <div className="flex flex-wrap gap-3">
        <div className="rounded-2xl border border-stone-200/80 bg-white px-5 py-3 shadow-sm">
          <div className="font-display text-xl font-semibold text-teal-600">{companies.length}</div>
          <div className="text-xs font-medium text-stone-500">Showing</div>
        </div>
        <div className="rounded-2xl border border-stone-200/80 bg-white px-5 py-3 shadow-sm">
          <div className="font-display text-xl font-semibold text-teal-600">{withAnalysis}</div>
          <div className="text-xs font-medium text-stone-500">With analysis</div>
        </div>
      </div>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(q.trim());
        }}
      >
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Symbol, name, or sector…"
          className="min-w-[200px] flex-1 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-stone-900 placeholder:text-stone-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        />
        <button
          type="submit"
          className="rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
        >
          Search
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2 gap-y-3">
        <span className="text-xs font-medium text-stone-500">Risk</span>
        {(["low", "moderate", "high"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setFilter("risk_tier", risk_tier === t ? null : t)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              risk_tier === t
                ? "bg-teal-600 text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            {riskTierLabel[t]}
          </button>
        ))}
        <span className="ml-2 text-xs font-medium text-stone-500 sm:ml-4">Investability</span>
        {(["high", "moderate", "low"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setFilter("investability", investability === t ? null : t)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              investability === t ? "bg-teal-600 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            {investabilityLabel[t]}
          </button>
        ))}
        <span className="ml-2 text-xs font-medium text-stone-500 sm:ml-4">Timing</span>
        {(["now", "wait", "avoid"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setFilter("entry_timing", entry_timing === t ? null : t)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              entry_timing === t ? "bg-teal-600 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            {entryTimingLabel[t]}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>
      )}

      {loading ? (
        <p className="py-12 text-center text-stone-500">Loading companies…</p>
      ) : companies.length === 0 ? (
        <p className="py-12 text-center text-stone-500">No companies match. Try different filters or search.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((c) => {
            const risk = getRiskTier(c.analysis as Record<string, unknown>);
            const inv = getInvestability(c.analysis as Record<string, unknown>);
            const timing = getEntryTiming(c.analysis as Record<string, unknown>);
            return (
              <Link
                key={c.id}
                to={`/company/${c.symbol}`}
                className="flex flex-col rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm transition-shadow hover:border-teal-200 hover:shadow-md"
              >
                <div className="font-mono text-sm font-semibold text-teal-600">{c.symbol}</div>
                <div className="mt-0.5 text-sm font-medium text-stone-800 line-clamp-2">{c.name}</div>
                <div className="mt-1 text-xs text-stone-500">{c.sector ?? "N/A"}</div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {risk && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        risk === "low"
                          ? "bg-emerald-100 text-emerald-800"
                          : risk === "high"
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {riskTierLabel[risk as RiskTier]}
                    </span>
                  )}
                  {inv && (
                    <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800">
                      {investabilityLabel[inv as Investability]}
                    </span>
                  )}
                  {timing && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        timing === "now"
                          ? "bg-emerald-100 text-emerald-800"
                          : timing === "avoid"
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {entryTimingLabel[timing as EntryTiming]}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
