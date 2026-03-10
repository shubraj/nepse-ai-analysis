import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useWatchlist } from "../contexts/WatchlistContext";
import type {
  Company,
  CompanyAnalysisListItem,
  CompanyAnalysisResponse,
} from "../types/company";
import {
  getRiskTier,
  getRecommendation,
  riskTierLabel,
  recommendationLabel,
} from "../lib/screening";
import type { RiskTier, Recommendation } from "../lib/screening";

const DEFAULT_DOC_TITLE = "NEPSE Research | Free Nepal Stock AI Analysis & NEPSE Fundamental Analysis Tool";
const DEFAULT_META_DESCRIPTION = "Free NEPSE stock AI analysis and Nepal stock market insights. AI-powered fundamental & technical analysis, screener, valuations for NEPSE. Informational only, not investment advice.";

function setPageMeta(title: string, description: string, path?: string) {
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
  if (path) {
    const ogUrl = document.querySelector('meta[property="og:url"]');
    const canonical = document.querySelector('link[rel="canonical"]');
    const url = `${window.location.origin}${path}`;
    if (ogUrl) ogUrl.setAttribute("content", url);
    if (canonical) canonical.setAttribute("href", url);
  }
}

function resetPageMeta() {
  document.title = DEFAULT_DOC_TITLE;
  const descEl = document.querySelector('meta[name="description"]');
  if (descEl) descEl.setAttribute("content", DEFAULT_META_DESCRIPTION);
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute("content", DEFAULT_DOC_TITLE);
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute("content", DEFAULT_META_DESCRIPTION);
  const twTitle = document.querySelector('meta[name="twitter:title"]');
  if (twTitle) twTitle.setAttribute("content", DEFAULT_DOC_TITLE);
  const twDesc = document.querySelector('meta[name="twitter:description"]');
  if (twDesc) twDesc.setAttribute("content", DEFAULT_META_DESCRIPTION);
  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.setAttribute("content", "https://nepseai.shubraj.com/");
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute("href", "https://nepseai.shubraj.com/");
}

function formatAnalysisDate(analyzed_at: string) {
  return new Date(analyzed_at).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
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

  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="mb-4 font-display text-base font-semibold text-stone-800">Current values</h2>
      <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map(([key, value]) => (
          <div key={key} className="flex flex-wrap justify-between gap-x-2 sm:flex-col sm:justify-start">
            <dt className="text-sm text-stone-500">{overviewLabel(key)}</dt>
            <dd className="text-sm font-medium text-stone-900">{value}</dd>
          </div>
        ))}
      </dl>
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
    <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm sm:p-6">
      <h3 className="mb-4 font-display text-base font-semibold text-stone-800">Analysis scores</h3>
      <div className="space-y-3">
        {scores.map((s) => (
          <div key={s.label} className="grid grid-cols-[1fr_auto] items-center gap-3 sm:grid-cols-[140px_1fr_2.5rem]">
            <span className="text-sm text-stone-500">{s.label}</span>
            <div className="h-2 overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full transition-[width]"
                style={{
                  width: `${((s.value ?? 0) / s.max) * 100}%`,
                  backgroundColor: s.danger ? "#dc2626" : "#0d9488",
                }}
              />
            </div>
            <span className="text-right text-sm font-semibold text-stone-700">
              {s.value}/{s.max}
            </span>
          </div>
        ))}
        {valuationScore != null && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3">
            <span className="text-sm text-stone-500">Valuation</span>
            <span className="font-medium text-stone-800">
              {valuationScore === -1 ? "Undervalued" : valuationScore === 0 ? "Fair" : "Overvalued"}
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
  const dividendProfile = analysis.dividend_profile as Record<string, unknown> | undefined;
  const risk = analysis.risk_analysis as Record<string, unknown> | undefined;
  const portfolio = analysis.portfolio_strategy_recommendation as Record<string, unknown> | undefined;
  const finalDecision = analysis.final_decision as Record<string, unknown> | undefined;
  const whoInvest = analysis.who_should_invest as unknown[];
  const whoAvoid = analysis.who_should_avoid as unknown[];

  const finalDecisionLabels: Record<string, string> = {
    invest_now: "Entry recommendation",
    wait_option: "Wait rationale",
    confidence_level: "Confidence",
    risk_tier: "Risk tier",
    investability_label: "Investability",
    entry_timing: "Entry timing",
  };

  const kv = (obj: Record<string, unknown> | undefined, skipNumeric = true, labelMap?: Record<string, string>) =>
    obj && typeof obj === "object"
      ? Object.entries(obj)
          .filter(
            ([k]) =>
              !skipNumeric ||
              (!k.endsWith("_numeric") && !k.endsWith("_pct") && !k.endsWith("_years_numeric"))
          )
          .map(([k, v]) => (
            <div key={k} className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 py-1.5 text-sm">
              <span className="text-stone-500">{(labelMap && labelMap[k]) || k.replace(/_/g, " ")}</span>
              <span className="text-stone-800">{Array.isArray(v) ? v.join(", ") : String(v ?? "N/A")}</span>
            </div>
          ))
      : null;

  const Card = ({
    title,
    children,
    highlight,
  }: {
    title: string;
    children: React.ReactNode;
    highlight?: boolean;
  }) => (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm sm:p-6 ${
        highlight ? "border-l-4 border-l-teal-500 border-stone-200/80 bg-teal-50/30" : "border-stone-200/80"
      }`}
    >
      <h3 className="mb-3 border-b border-stone-100 pb-2 font-display text-base font-semibold text-stone-800">
        {title}
      </h3>
      {children}
    </div>
  );

  return (
    <div className="space-y-4">
      <AnalysisScoresSection analysis={analysis} />
      {investment && (
        <Card title="Investment snapshot">
          <div className="space-y-0">{kv(investment)}</div>
        </Card>
      )}
      {valuation && (
        <Card title="Valuation analysis">
          <div className="space-y-0">{kv(valuation)}</div>
        </Card>
      )}
      {shortTerm && (
        <Card title="Short term (0–12 months)">
          <div className="space-y-0">{kv(shortTerm)}</div>
        </Card>
      )}
      {midTerm && (
        <Card title="Mid term (1–3 years)">
          <div className="space-y-0">{kv(midTerm)}</div>
        </Card>
      )}
      {longTerm && (
        <Card title="Long term (3–5 years)">
          <div className="space-y-0">{kv(longTerm)}</div>
        </Card>
      )}
      {dividendProfile && (
        <Card title="Dividend profile">
          <div className="space-y-0">{kv(dividendProfile)}</div>
        </Card>
      )}
      {risk && (
        <Card title="Risk analysis">
          <div className="space-y-0">{kv(risk)}</div>
        </Card>
      )}
      {portfolio && (
        <Card title="Portfolio strategy">
          <div className="space-y-0">{kv(portfolio)}</div>
        </Card>
      )}
      {finalDecision && (
        <Card title="Final decision" highlight>
          <div className="space-y-0">{kv(finalDecision, true, finalDecisionLabels)}</div>
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
  const [analyses, setAnalyses] = useState<CompanyAnalysisListItem[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<CompanyAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([api.getCompany(symbol), api.listCompanyAnalyses(symbol)])
      .then(([companyData, analysesData]) => {
        if (!cancelled) {
          setCompany(companyData);
          setAnalyses(analysesData);
          setSelectedAnalysis(null);
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
      const fullName = company.name || company.symbol;
      const title = `${fullName} (${company.symbol}) | NEPSE Stock AI Analysis`;
      const description = `${fullName} (${company.symbol}) – Free AI analysis, NEPSE fundamental & technical analysis, valuation and risk. Nepal stock AI analysis.`;
      setPageMeta(title, description, `/company/${company.symbol}`);
    }
    return resetPageMeta;
  }, [company]);

  const loadAnalysisById = (analysisId: number) => {
    if (!symbol) return;
    setSelectedAnalysis(null);
    api
      .getCompanyAnalysis(symbol, analysisId)
      .then(setSelectedAnalysis)
      .catch(() => setSelectedAnalysis(null));
  };

  const analysisToShow = selectedAnalysis?.analysis ?? company?.analysis ?? null;

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
  const rec = analysisToShow && getRecommendation(analysisToShow as Record<string, unknown>);
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

      <header className="rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-lg bg-stone-100 px-3 py-2 font-mono text-base font-semibold text-stone-800">
              {company.symbol}
            </span>
            {rec && (
              <span
                className={`inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium ${
                  rec === "consider"
                    ? "bg-emerald-100 text-emerald-800"
                    : rec === "avoid"
                      ? "bg-red-100 text-red-800"
                      : "bg-amber-100 text-amber-800"
                }`}
              >
                {recommendationLabel[rec as Recommendation]}
              </span>
            )}
            {risk && (
              <span
                className={`inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium ${
                  risk === "low"
                    ? "bg-sky-100 text-sky-800"
                    : risk === "high"
                      ? "bg-red-100 text-red-800"
                      : "bg-amber-100 text-amber-800"
                }`}
              >
                {riskTierLabel[risk as RiskTier]}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleWatchlist(company.symbol)}
              className={`inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                inWatchlist
                  ? "bg-teal-100 text-teal-800 hover:bg-teal-200"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-800"
              }`}
            >
              {inWatchlist ? "In watchlist ✓" : "Add to watchlist"}
            </button>
            <Link
              to={`/compare?symbols=${encodeURIComponent(company.symbol)}`}
              className="inline-flex items-center rounded-lg bg-stone-100 px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-200 hover:text-stone-800"
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
          {company.sector ?? "N/A"}
          <span className="mx-2 text-stone-300">·</span>
          Data as of {new Date(company.updated_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
        </p>
        {analysisToShow && (() => {
          const fin = analysisToShow.final_decision as Record<string, unknown> | undefined;
          const confidence = fin && typeof fin.confidence_score_numeric === "number" ? fin.confidence_score_numeric : null;
          const summary = fin && typeof fin.summary_verdict === "string" ? fin.summary_verdict : null;
          return (
            <>
              {summary && <p className="mt-2 text-sm text-stone-600 italic">&ldquo;{summary}&rdquo;</p>}
              {confidence !== null && confidence <= 4 && (
                <p className="mt-2 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded inline-block">
                  Low confidence in this analysis.
                </p>
              )}
            </>
          );
        })()}
        {analyses.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="text-sm text-stone-500">Analysis from:</span>
            <select
              onChange={(e) => {
                const v = e.target.value;
                if (v === "latest") setSelectedAnalysis(null);
                else {
                  const id = parseInt(v, 10);
                  if (!Number.isNaN(id)) loadAnalysisById(id);
                }
              }}
              className="rounded-lg border border-stone-200 bg-stone-50/80 px-3 py-2 text-sm text-stone-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            >
              <option value="latest">Latest</option>
              {analyses.map((a) => (
                <option key={a.id} value={a.id}>
                  {formatAnalysisDate(a.analyzed_at)}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      <CurrentValuesSection sector={company.sector} overview={company.overview} />

      {analysisToShow && Object.keys(analysisToShow).length > 0 && (
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 px-4 py-3 text-sm text-amber-900">
          <strong>Disclaimer:</strong> This analysis is AI-generated from historical and publicly available data. It is for information only and is not professional investment advice. Consult a qualified financial advisor before investing.
        </div>
      )}

      {analysisToShow && Object.keys(analysisToShow).length > 0 ? (
        <AnalysisCardsSection analysis={analysisToShow} />
      ) : (
        <div className="rounded-2xl border border-stone-200/80 bg-stone-50/50 p-10 text-center">
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
