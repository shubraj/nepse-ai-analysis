import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { updatePageMeta, addJsonLd, createBreadcrumbSchema, createWebPageSchema, toAbsoluteUrl } from "../lib/seo";
import type { Company } from "../types/company";
import {
  getRiskTier,
  getSignal,
  riskTierLabel,
  signalLabel,
  entryTimingLabel,
} from "../lib/screening";
import type { RiskTier, Signal } from "../lib/screening";

export function CompanyList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");

  const risk_tier = searchParams.get("risk_tier") || undefined;
  const entry_timing = searchParams.get("entry_timing") || undefined;
  const investability = searchParams.get("investability") || undefined;
  const sector = searchParams.get("sector") || undefined;

  const [sectors, setSectors] = useState<string[]>([]);

  // SEO: screener page meta and schema
  useEffect(() => {
    const riskLabel = risk_tier ? ` – ${risk_tier}` : "";
    const sectorLabel = sector ? ` – ${sector}` : "";
    const title = `NEPSE Stock Screener${sectorLabel}${riskLabel} | Filter Nepal Stocks by Buy/Hold/Sell | NepseAI`;
    const description = `Filter and screen NEPSE stocks with Buy, Hold, Sell signals, risk tier, sector and entry timing. AI-powered fundamental analysis for Nepal stock market screening. Find the best NEPSE stocks to invest in.`;

    updatePageMeta({
      title,
      description,
      keywords: `NEPSE screener, stock filter, risk analysis, Nepal stocks, investment recommendations, ${sector || "Nepal stock market"}, NEPSE stock list`,
      url: window.location.href,
      canonicalUrl: `${window.location.origin}/companies`,
    });

    // Add breadcrumb schema
    addJsonLd(
      createBreadcrumbSchema([
        { name: "NepseAI", url: `${window.location.origin}/` },
        { name: "Screener", url: `${window.location.origin}/companies` },
      ])
    );

    addJsonLd(
      createWebPageSchema({
        title,
        description,
        url: `${window.location.origin}/companies`,
        image: toAbsoluteUrl("/og-image.svg"),
      })
    );
  }, [risk_tier, sector]);

  useEffect(() => {
    let cancelled = false;
    api.listSectors().then((data) => { if (!cancelled) setSectors(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .listCompanies({
        limit: 500,
        q: search || undefined,
        risk_tier,
        entry_timing,
        investability,
        sector,
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
  }, [search, risk_tier, entry_timing, investability, sector]);

  const withAnalysis = companies.filter((c) => c.analysis).length;

  const setFilter = (key: "risk_tier" | "entry_timing", value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  };

  const setSectorFilter = (value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("sector", value);
    else next.delete("sector");
    setSearchParams(next);
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold text-stone-900">NEPSE Stock Screener</h1>
        <p className="mt-2 text-base text-stone-600">
          Screen Nepal stocks by Buy/Hold/Sell signal, risk tier, and sector using AI-assisted analysis grounded in historical market and fundamentals data.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <div className="surface-card rounded-2xl px-5 py-3">
          <div className="font-display text-xl font-semibold text-teal-600">{companies.length}</div>
          <div className="text-xs font-medium text-stone-500">Showing</div>
        </div>
        <div className="surface-card rounded-2xl px-5 py-3">
          <div className="font-display text-xl font-semibold text-teal-600">{withAnalysis}</div>
          <div className="text-xs font-medium text-stone-500">With analysis</div>
        </div>
      </div>

      <div className="surface-card rounded-2xl p-4 sm:p-5">
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

        <div className="mt-4 flex flex-wrap items-center gap-2 gap-y-3">
          {sectors.length > 0 && (
            <>
              <span className="text-xs font-medium text-stone-500">Sector</span>
              <select
                value={sector ?? ""}
                onChange={(e) => setSectorFilter(e.target.value || null)}
                className="rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              >
                <option value="">All sectors</option>
                {sectors.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </>
          )}
          <span className="text-xs font-medium text-stone-500 sm:ml-2">Signal</span>
          {(["now", "wait", "avoid"] as const).map((t) => {
            const label = entryTimingLabel[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => setFilter("entry_timing", entry_timing === t ? null : t)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  entry_timing === t ? "bg-teal-600 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                {label}
              </button>
            );
          })}
          <span className="ml-2 text-xs font-medium text-stone-500 sm:ml-4">Risk</span>
          {(["low", "moderate", "high"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilter("risk_tier", risk_tier === t ? null : t)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                risk_tier === t ? "bg-teal-600 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {riskTierLabel[t]}
            </button>
          ))}
        </div>
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
            const sig = getSignal(c.analysis as Record<string, unknown>);
            return (
              <Link
                key={c.id}
                to={`/company/${c.symbol}`}
                className="surface-card flex flex-col rounded-2xl p-4 transition-transform duration-200 hover:-translate-y-0.5"
              >
                <div className="font-mono text-sm font-semibold text-teal-600">{c.symbol}</div>
                <div className="mt-0.5 text-sm font-medium text-stone-800 line-clamp-2">{c.name}</div>
                <div className="mt-1 text-xs text-stone-500">{c.sector ?? "N/A"}</div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {sig && (
                    <span
                      className={`inline-flex items-center rounded-lg px-2.5 py-1 text-sm font-medium ${
                        sig === "buy" ? "bg-emerald-100 text-emerald-800" : sig === "sell" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {signalLabel[sig as Signal]}
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
      )}
    </div>
  );
}
