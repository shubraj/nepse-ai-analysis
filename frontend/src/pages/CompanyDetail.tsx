import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useWatchlist } from "../contexts/WatchlistContext";
import {
  updatePageMeta,
  addJsonLd,
  clearJsonLd,
  createBreadcrumbSchema,
  createArticleSchema,
  createProductSchema,
  createStockSchema,
  createWebPageSchema,
  resetPageMeta,
  toAbsoluteUrl,
} from "../lib/seo";
import type {
  Company,
} from "../types/company";
import {
  getRiskTier,
  getSignal,
  riskTierLabel,
  signalLabel,
} from "../lib/screening";
import type { RiskTier, Signal } from "../lib/screening";

function setPageMeta(company: Company) {
  const title = `${company.symbol} Stock Analysis - Buy, Hold, Sell & Risk | NepseAI`;
  const description = `AI-powered NEPSE analysis of ${company.symbol} (${company.name}). Get Buy, Hold, Sell signal, risk tier, valuation, PE ratio, dividend history and outlook for ${company.symbol} on Nepal Stock Exchange. Updated daily.`;
  const pageUrl = `${window.location.origin}/company/${company.symbol}`;

  updatePageMeta({
    title,
    description,
    keywords: `${company.symbol}, ${company.name}, NEPSE analysis, Nepal stock, ${company.sector || ""}, ${company.symbol} stock price, ${company.symbol} investment, Nepal stock exchange`,
    url: pageUrl,
    canonicalUrl: pageUrl,
    image: toAbsoluteUrl("/og-image.svg"),
    imageAlt: `${company.symbol} stock analysis dashboard`,
    type: "article",
  });

  // Add breadcrumb schema
  addJsonLd(
    createBreadcrumbSchema([
      { name: "NepseAI", url: `${window.location.origin}/` },
      { name: "Screener", url: `${window.location.origin}/companies` },
      { name: `${company.symbol} Analysis`, url: `${window.location.origin}/company/${company.symbol}` },
    ])
  );

  // Add article schema for the analysis
  addJsonLd(
    createArticleSchema({
      headline: `${company.symbol}: ${company.name} – NEPSE Stock Analysis`,
      description,
      datePublished: company.created_at,
      dateModified: company.updated_at,
      author: "NepseAI",
      keywords: `${company.symbol}, ${company.sector || "Nepal stocks"}, NEPSE analysis`,
    })
  );

  // Add FinancialProduct schema for the stock
  addJsonLd(
    createStockSchema({
      symbol: company.symbol,
      name: company.name,
      sector: company.sector || undefined,
      description,
      url: pageUrl,
    })
  );

  addJsonLd(
    createProductSchema({
      symbol: company.symbol,
      name: company.name,
      description,
      url: pageUrl,
      image: toAbsoluteUrl("/og-image.svg"),
    })
  );

  addJsonLd(
    createWebPageSchema({
      title,
      description,
      url: pageUrl,
      image: toAbsoluteUrl("/og-image.svg"),
    })
  );
}

const OVERVIEW_LABELS: Record<string, string> = {
  market_price: "Current price",
  p_e_ratio: "P/E ratio",
  pe_ratio: "P/E ratio",
  book_value: "Book value",
  eps: "EPS",
  pbv: "P/BV",
  sector: "Sector",
  "52_weeks_high_low": "52 weeks high/low",
  pct_change: "% change",
  "120_day_average": "120 day average",
  market_capitalization: "Market cap",
  shares_outstanding: "Shares outstanding",
  "30_day_avg_volume": "30 day avg volume",
  "1_year_yield": "1 year yield",
  last_traded_on: "Last traded",
};

function formatOverviewValue(key: string, value: string): string {
  const num = parseFloat(value.replace(/[,\s]/g, ""));
  const isNum = !Number.isNaN(num);
  if (key === "market_price" && isNum) return `Rs ${num.toLocaleString("en-NP", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (key === "pct_change" && isNum) return `${num >= 0 ? "+" : ""}${num}%`;
  if (["market_capitalization", "shares_outstanding", "30_day_avg_volume"].includes(key) && isNum) return num.toLocaleString("en-NP");
  if (["p_e_ratio", "pe_ratio", "book_value", "eps", "pbv", "120_day_average", "1_year_yield"].includes(key) && isNum) return num.toLocaleString("en-NP", { maximumFractionDigits: 2 });
  return value;
}

const OVERVIEW_ORDER = [
  "market_price",
  "pct_change",
  "sector",
  "p_e_ratio",
  "pe_ratio",
  "book_value",
  "eps",
  "pbv",
  "52_weeks_high_low",
  "120_day_average",
  "market_capitalization",
  "shares_outstanding",
  "30_day_avg_volume",
  "1_year_yield",
  "last_traded_on",
];

const OVERVIEW_PRIMARY = [
  "market_price",
  "pct_change",
  "p_e_ratio",
  "pbv",
  "eps",
  "1_year_yield",
];

function overviewLabel(key: string): string {
  return OVERVIEW_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function CurrentValuesSection({
  sector,
  overview,
}: {
  sector: string | null;
  overview: Record<string, string | number> | null;
}) {
  const hasOverview = overview && typeof overview === "object" && Object.keys(overview).length > 0;
  const hasSector = sector != null && sector.trim() !== "";
  if (!hasOverview && !hasSector) return null;

  const entries: [string, string][] = [];
  const seen = new Set<string>();
  if (hasOverview) {
    for (const key of OVERVIEW_ORDER) {
      if (overview[key] != null && overview[key] !== "" && !seen.has(key)) {
        seen.add(key);
        entries.push([key, formatOverviewValue(key, String(overview[key]))]);
      }
    }
    Object.entries(overview).forEach(([k, v]) => {
      if (v != null && v !== "" && !seen.has(k)) {
        seen.add(k);
        entries.push([k, formatOverviewValue(k, String(v))]);
      }
    });
  }
  if (!seen.has("sector") && hasSector) {
    entries.unshift(["sector", sector!.trim()]);
  }

  if (entries.length === 0) return null;

  const primaryEntries = entries.filter(([k]) => OVERVIEW_PRIMARY.includes(k));
  const secondaryEntries = entries.filter(([k]) => !OVERVIEW_PRIMARY.includes(k));

  return (
    <div className="surface-card rounded-2xl p-5 sm:p-6">
      <h2 className="mb-4 font-display text-base font-semibold text-stone-800">Key metrics</h2>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(primaryEntries.length > 0 ? primaryEntries : entries.slice(0, 6)).map(([key, value]) => (
          <div key={key} className="rounded-lg border border-stone-100 px-3 py-2">
            <dt className="text-[11px] uppercase tracking-wide text-stone-500">{overviewLabel(key)}</dt>
            <dd className="text-sm font-semibold text-stone-900">{value}</dd>
          </div>
        ))}
      </dl>
      {secondaryEntries.length > 0 && (
        <details className="mt-4 rounded-lg border border-stone-200/80 bg-white p-3">
          <summary className="cursor-pointer text-sm font-medium text-stone-700">More market details</summary>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {secondaryEntries.map(([key, value]) => (
              <div key={key} className="flex flex-wrap justify-between gap-x-2 text-sm">
                <dt className="text-stone-500">{overviewLabel(key)}</dt>
                <dd className="font-medium text-stone-800">{value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}

type Analysis = Record<string, unknown> | null;

function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  const n = parseFloat(String(v));
  return Number.isNaN(n) ? null : n;
}

function summarizeVerdict(text: string, maxLen = 200): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const sentenceMatch = trimmed.match(/^(.+?[.!?])\s/);
  const firstSentence = sentenceMatch ? sentenceMatch[1] : trimmed;
  if (firstSentence.length <= maxLen) return firstSentence;
  return `${firstSentence.slice(0, maxLen).trim()}...`;
}

function AnalysisScoresSection({ analysis }: { analysis: Analysis }) {
  if (!analysis || typeof analysis !== "object") return null;
  const inv = analysis.investment_snapshot as Record<string, unknown> | undefined;
  const val = analysis.valuation_analysis as Record<string, unknown> | undefined;
  const risk = analysis.risk_analysis as Record<string, unknown> | undefined;
  const div = analysis.dividend_profile as Record<string, unknown> | undefined;
  const fin = analysis.final_decision as Record<string, unknown> | undefined;

  const scores: { label: string; value: number | null; max: number; danger?: boolean }[] = [
    { label: "Quality", value: num(inv?.investment_quality_score_numeric), max: 10 },
    { label: "Risk", value: num(inv?.risk_score_numeric), max: 10, danger: true },
    { label: "Return potential", value: num(inv?.return_potential_numeric), max: 10 },
    { label: "Confidence", value: num(fin?.confidence_score_numeric), max: 10 },
    { label: "Volatility", value: num(risk?.volatility_score_numeric), max: 10, danger: true },
    { label: "Dividend consistency", value: num(div?.dividend_consistency_score_numeric), max: 10 },
    { label: "Income reliability", value: num(div?.income_reliability_score_numeric), max: 10 },
  ].filter((s) => s.value != null);

  const valuationScore = num(val?.valuation_score_numeric);
  const investScore = num(fin?.invest_score_numeric);

  if (scores.length === 0 && valuationScore == null && investScore == null) return null;

  return (
    <div className="surface-card rounded-2xl p-5 sm:p-6">
      <h3 className="mb-4 font-display text-base font-semibold text-stone-800">Analysis scores</h3>
      <div className="divide-y divide-stone-100">
        {scores.map((s) => (
          <div key={s.label} className="flex items-center justify-between py-2">
            <span className="text-sm text-stone-600">{s.label}</span>
            <span className="font-mono text-sm font-semibold text-stone-800">
              {s.value}/{s.max}
            </span>
          </div>
        ))}
        {valuationScore != null && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
            <span className="text-sm text-stone-500">Valuation</span>
            <span className="font-medium text-stone-800">
              {valuationScore === 1 ? "Undervalued" : valuationScore === 0 ? "Fair" : "Overvalued"}
            </span>
          </div>
        )}
        {investScore != null && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-stone-500">Consider investing now</span>
            <span className="font-medium text-stone-800">
              {investScore <= 0 ? "No" : investScore < 1 ? "Conditional" : "Yes"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function AnalysisCardsSection({ analysis }: { analysis: Analysis }) {
  if (!analysis || typeof analysis !== "object") return null;

  const investment = analysis.investment_snapshot as Record<string, unknown> | undefined;
  const valuation = analysis.valuation_analysis as Record<string, unknown> | undefined;
  const shortTerm = analysis.short_term_outlook_0_to_12_months as Record<string, unknown> | undefined;
  const midTerm = analysis.mid_term_outlook_1_to_3_years as Record<string, unknown> | undefined;
  const longTerm = analysis.long_term_outlook_3_to_5_years as Record<string, unknown> | undefined;
  const risk = analysis.risk_analysis as Record<string, unknown> | undefined;
  const finalDecision = analysis.final_decision as Record<string, unknown> | undefined;
  const whoInvest = analysis.who_should_invest as unknown[];
  const whoAvoid = analysis.who_should_avoid as unknown[];

  const toText = (v: unknown): string => {
    if (v == null || v === "") return "N/A";
    if (Array.isArray(v)) return v.map((x) => String(x)).join(", ");
    return String(v);
  };

  const summaryItems = [
    {
      label: "Signal",
      value: (() => {
        const raw = String(finalDecision?.recommendation ?? "").trim().toLowerCase();
        if (raw === "consider") return "Buy";
        if (raw === "watch") return "Hold";
        if (raw === "avoid") return "Sell";
        return finalDecision?.recommendation;
      })(),
    },
    {
      label: "Entry timing",
      value: (() => {
        const raw = String(finalDecision?.entry_timing ?? "").trim().toLowerCase();
        if (raw === "now") return "Buy Now";
        if (raw === "wait") return "Wait";
        if (raw === "avoid") return "Sell Now";
        return finalDecision?.entry_timing;
      })(),
    },
    { label: "Risk tier", value: finalDecision?.risk_tier },
    { label: "Investability", value: finalDecision?.investability_label },
    { label: "Confidence", value: finalDecision?.confidence_level },
  ].filter((x) => x.value != null && x.value !== "");

  const valuationItems = [
    { label: "Valuation status", value: valuation?.valuation_status },
    { label: "P/E view", value: valuation?.pe_interpretation },
    { label: "P/BV view", value: valuation?.pb_interpretation },
    { label: "Style", value: valuation?.value_or_growth_style },
  ].filter((x) => x.value != null && x.value !== "");

  const horizonItems = [
    {
      label: "Short term",
      value: shortTerm?.strategy || shortTerm?.expected_price_range_change || shortTerm?.growth_probability,
    },
    {
      label: "Mid term",
      value: midTerm?.strategy || midTerm?.expected_annual_return || midTerm?.growth_probability,
    },
    {
      label: "Long term",
      value: longTerm?.investment_theme || longTerm?.expected_annual_return_best_case || longTerm?.long_term_risk,
    },
  ].filter((x) => x.value != null && x.value !== "");

  const topRisks = (risk?.primary_risks as unknown[] | undefined) ?? [];

  const Card = ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <div className="surface-card rounded-2xl p-5 sm:p-6">
      <h3 className="mb-3 border-b border-stone-100 pb-2 font-display text-base font-semibold text-stone-800">
        {title}
      </h3>
      {children}
    </div>
  );

  return (
    <div className="space-y-4">
      <AnalysisScoresSection analysis={analysis} />
      {(summaryItems.length > 0 || investment) && (
        <Card title="At a glance">
          <div className="grid gap-2 sm:grid-cols-2">
            {summaryItems.map((item) => (
              <div key={item.label} className="rounded-lg border border-stone-100 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-stone-500">{item.label}</div>
                <div className="text-sm font-medium text-stone-800">{toText(item.value)}</div>
              </div>
            ))}
            {investment?.suitability != null && investment?.suitability !== "" && (
              <div className="rounded-lg border border-stone-100 px-3 py-2 sm:col-span-2">
                <div className="text-[11px] uppercase tracking-wide text-stone-500">Suitable for</div>
                <div className="text-sm font-medium text-stone-800">{toText(investment?.suitability)}</div>
              </div>
            )}
          </div>
        </Card>
      )}

      {(valuationItems.length > 0 || horizonItems.length > 0) && (
        <Card title="Outlook and valuation">
          {valuationItems.length > 0 && (
            <div className="space-y-2">
              {valuationItems.map((item) => (
                <div key={item.label} className="flex flex-wrap justify-between gap-2 text-sm">
                  <span className="text-stone-500">{item.label}</span>
                  <span className="font-medium text-stone-800">{toText(item.value)}</span>
                </div>
              ))}
            </div>
          )}
          {horizonItems.length > 0 && (
            <div className="mt-4 space-y-2 border-t border-stone-100 pt-3">
              {horizonItems.map((item) => (
                <div key={item.label} className="rounded-lg bg-stone-50 px-3 py-2">
                  <div className="text-xs uppercase tracking-wide text-stone-500">{item.label}</div>
                  <div className="text-sm text-stone-800">{toText(item.value)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {topRisks.length > 0 && (
        <Card title="Top risks">
          <ul className="space-y-2">
            {topRisks.slice(0, 5).map((item, i) => (
              <li key={i} className="text-sm text-stone-700">• {toText(item)}</li>
            ))}
          </ul>
        </Card>
      )}

      {(whoInvest?.length > 0 || whoAvoid?.length > 0) && (
        <Card title="Who should invest / avoid">
          <div className="space-y-3">
            {whoInvest?.length > 0 && (
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-stone-500">Invest</span>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {whoInvest.map((item, i) => (
                    <li
                      key={i}
                      className="rounded-lg bg-emerald-50 px-2.5 py-1 text-sm text-emerald-800"
                    >
                      {String(item)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {whoAvoid?.length > 0 && (
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-stone-500">Avoid</span>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {whoAvoid.map((item, i) => (
                    <li
                      key={i}
                      className="rounded-lg bg-red-50 px-2.5 py-1 text-sm text-red-800"
                    >
                      {String(item)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

export function CompanyDetail() {
  const { symbol } = useParams<{ symbol: string }>();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.getCompany(symbol)
      .then((companyData) => {
        if (!cancelled) {
          setCompany(companyData);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Not found");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  useEffect(() => {
    if (company) {
      setPageMeta(company);
    }
    return () => {
      clearJsonLd(["Article", "FinancialProduct", "Product", "WebPage", "BreadcrumbList"]);
      resetPageMeta();
    };
  }, [company]);

  const analysisToShow = company?.analysis ?? null;

  if (!symbol) return <p className="text-stone-600">Missing symbol.</p>;
  if (loading) return <p className="py-16 text-center text-stone-500">Loading company…</p>;
  if (error || !company)
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
        {error ?? "Company not found."}
        <Link to="/companies" className="mt-3 block text-sm font-medium text-red-600 hover:underline">← Back to screener</Link>
      </div>
    );

  const risk = analysisToShow && getRiskTier(analysisToShow as Record<string, unknown>);
  const sig = analysisToShow && getSignal(analysisToShow as Record<string, unknown>);
  const { isInWatchlist, toggle: toggleWatchlist } = useWatchlist();
  const inWatchlist = isInWatchlist(company.symbol);

  return (
    <div className="space-y-8">
      <nav className="flex items-center gap-2 text-sm text-stone-500">
        <Link to="/companies" className="hover:text-teal-600 transition-colors">
          Screener
        </Link>
        <span aria-hidden className="text-stone-300">/</span>
        <span className="text-stone-800 font-medium truncate max-w-[200px] sm:max-w-none">
          {company.name}
        </span>
      </nav>

      <header className="surface-card rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 font-mono text-sm font-semibold text-stone-800">
              {company.symbol}
            </span>
            {sig && (
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                  sig === "buy"
                    ? "badge-buy"
                    : sig === "sell"
                      ? "badge-sell"
                      : "badge-hold"
                }`}
              >
                {signalLabel[sig as Signal]}
              </span>
            )}
            {risk && (
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                  risk === "low"
                    ? "badge-risk-low"
                    : risk === "high"
                      ? "badge-risk-high"
                      : "badge-risk-moderate"
                }`}
              >
                {riskTierLabel[risk as RiskTier]}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => toggleWatchlist(company.symbol)}
              className={`inline-flex items-center rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium transition-colors ${
                inWatchlist
                  ? "bg-teal-50 text-teal-700 hover:bg-teal-100"
                  : "bg-white text-stone-600 hover:bg-stone-50 hover:text-stone-800"
              }`}
            >
              {inWatchlist ? "In watchlist ✓" : "Add to watchlist"}
            </button>
            <Link
              to={`/compare?symbols=${encodeURIComponent(company.symbol)}`}
              className="inline-flex items-center rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-50 hover:text-stone-800"
            >
              Compare
            </Link>
          </div>
        </div>
        <h1 className="mt-4 font-display text-2xl font-semibold text-stone-900 sm:text-3xl">
          {company.name}
        </h1>
        {company.overview && (company.overview.market_price != null || company.overview.pct_change != null) && (
          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            {company.overview.market_price != null && company.overview.market_price !== "" && (
              <span className="font-semibold text-stone-900">
                {formatOverviewValue("market_price", String(company.overview.market_price))}
              </span>
            )}
            {company.overview.pct_change != null && company.overview.pct_change !== "" && (() => {
              const pct = parseFloat(String(company.overview.pct_change).replace(/[,\s]/g, ""));
              const isNeg = !Number.isNaN(pct) && pct < 0;
              return (
                <span className={isNeg ? "text-red-600 font-medium" : "text-emerald-600 font-medium"}>
                  {formatOverviewValue("pct_change", String(company.overview.pct_change))}
                </span>
              );
            })()}
          </div>
        )}
        <p className="mt-1 text-sm text-stone-500">
          {company.sector ? (
            <Link to={`/companies?sector=${encodeURIComponent(company.sector)}`} className="hover:text-teal-700 hover:underline">
              {company.sector}
            </Link>
          ) : "N/A"}
          <span className="mx-2 text-stone-300">·</span>
          Data as of {new Date(company.updated_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
        </p>
        {analysisToShow && (() => {
          const fin = analysisToShow.final_decision as Record<string, unknown> | undefined;
          const confidence = fin && typeof fin.confidence_score_numeric === "number" ? fin.confidence_score_numeric : null;
          const summary = fin && typeof fin.summary_verdict === "string" ? fin.summary_verdict : null;
          return (
            <>
              {summary && (
                <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50/60 px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-stone-500">Summary</p>
                  <p className="mt-1 text-sm text-stone-700">{summarizeVerdict(summary)}</p>
                  {summary.length > 220 && (
                    <details className="mt-2 text-xs text-stone-600">
                      <summary className="cursor-pointer font-medium">Read full analysis note</summary>
                      <p className="mt-2 leading-relaxed text-stone-600">{summary}</p>
                    </details>
                  )}
                </div>
              )}
              {confidence !== null && confidence <= 4 && (
                <p className="mt-2 text-xs text-amber-700">Low confidence in this analysis.</p>
              )}
            </>
          );
        })()}
      </header>

      <CurrentValuesSection sector={company.sector} overview={company.overview} />

      {analysisToShow && Object.keys(analysisToShow).length > 0 && (
        <div className="rounded-2xl border border-stone-200 bg-stone-50/70 px-4 py-3 text-sm text-stone-600">
          <strong>Disclaimer:</strong> This analysis is AI-generated from historical and publicly available data. It is for information only and is not professional investment advice. Consult a qualified financial advisor before investing.
        </div>
      )}

      {analysisToShow && Object.keys(analysisToShow).length > 0 ? (
        <AnalysisCardsSection analysis={analysisToShow} />
      ) : (
        <div className="rounded-2xl border border-stone-200/80 bg-white p-10 text-center">
          <p className="text-stone-600">No analysis available for this company yet.</p>
          <Link to="/companies" className="mt-3 inline-block text-sm font-medium text-teal-600 hover:text-teal-700">
            Browse other companies →
          </Link>
        </div>
      )}

      <div className="pt-2">
        <Link
          to="/companies"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-600 hover:text-teal-700"
        >
          <span aria-hidden>←</span> Back to screener
        </Link>
      </div>
    </div>
  );
}
