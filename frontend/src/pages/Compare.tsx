import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { updatePageMeta, addJsonLd, createBreadcrumbSchema } from "../lib/seo";
import type { Company } from "../types/company";
import { getRiskTier, getSignal, riskTierLabel, signalLabel } from "../lib/screening";
import type { RiskTier, Signal } from "../lib/screening";

function num(a: Record<string, unknown> | null | undefined, ...path: string[]): number | null {
  if (!a) return null;
  let d: unknown = a;
  for (const key of path.slice(0, -1)) {
    d = (d as Record<string, unknown>)?.[key];
    if (d == null || typeof d !== "object") return null;
  }
  const v = (d as Record<string, unknown>)?.[path[path.length - 1]];
  if (v == null) return null;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  const n = parseFloat(String(v));
  return Number.isNaN(n) ? null : n;
}

function str(a: Record<string, unknown> | null | undefined, ...path: string[]): string | null {
  if (!a) return null;
  let d: unknown = a;
  for (const key of path.slice(0, -1)) {
    d = (d as Record<string, unknown>)?.[key];
    if (d == null || typeof d !== "object") return null;
  }
  const v = (d as Record<string, unknown>)?.[path[path.length - 1]];
  return v != null ? String(v) : null;
}

type CompareRow = {
  label: string;
  getVal: (c: Company) => React.ReactNode;
  getNum?: (c: Company) => number | null;
  better?: "higher" | "lower";
};

function CompareTable({ companyA, companyB }: { companyA: Company; companyB: Company }) {
  const inv = (c: Company) => (c.analysis as Record<string, unknown>)?.investment_snapshot as Record<string, unknown> | undefined;
  const val = (c: Company) => (c.analysis as Record<string, unknown>)?.valuation_analysis as Record<string, unknown> | undefined;
  const fin = (c: Company) => (c.analysis as Record<string, unknown>)?.final_decision as Record<string, unknown> | undefined;
  const short = (c: Company) => (c.analysis as Record<string, unknown>)?.short_term_outlook_0_to_12_months as Record<string, unknown> | undefined;
  const mid = (c: Company) => (c.analysis as Record<string, unknown>)?.mid_term_outlook_1_to_3_years as Record<string, unknown> | undefined;

  const rows: CompareRow[] = [
    {
      label: "Market price",
      getVal: (c) => {
        const v = c.overview?.market_price ?? (c.overview as Record<string, unknown>)?.market_price;
        return v != null ? String(v) : null;
      },
    },
    {
      label: "% change",
      getVal: (c) => {
        const v = (c.overview as Record<string, unknown>)?.pct_change;
        if (v == null || v === "") return null;
        const s = String(v);
        const n = parseFloat(s.replace(/[^0-9.-]/g, ""));
        const isNeg = !Number.isNaN(n) && n < 0;
        return <span className={isNeg ? "text-red-600 font-medium" : "text-emerald-600 font-medium"}>{s}</span>;
      },
      getNum: (c) => {
        const v = (c.overview as Record<string, unknown>)?.pct_change;
        if (v == null) return null;
        const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
        return Number.isNaN(n) ? null : n;
      },
      better: "higher",
    },
    {
      label: "P/E",
      getVal: (c) => {
        const ov = c.overview as Record<string, unknown> | null;
        const n = num(ov ?? null, "pe_ratio") ?? num(ov ?? null, "p_e_ratio");
        return n != null ? n : null;
      },
      getNum: (c) => num(c.overview as Record<string, unknown> ?? null, "pe_ratio") ?? num(c.overview as Record<string, unknown> ?? null, "p_e_ratio"),
      better: "lower",
    },
    {
      label: "P/BV",
      getVal: (c) => {
        const n = num(c.overview as Record<string, unknown> ?? null, "pbv");
        return n != null ? n : null;
      },
      getNum: (c) => num(c.overview as Record<string, unknown> ?? null, "pbv"),
      better: "lower",
    },
    {
      label: "Quality score",
      getVal: (c) => num(inv(c) ?? null, "investment_quality_score_numeric"),
      getNum: (c) => num(inv(c) ?? null, "investment_quality_score_numeric"),
      better: "higher",
    },
    {
      label: "Risk score",
      getVal: (c) => num(inv(c) ?? null, "risk_score_numeric"),
      getNum: (c) => num(inv(c) ?? null, "risk_score_numeric"),
      better: "lower",
    },
    {
      label: "Return potential",
      getVal: (c) => num(inv(c) ?? null, "return_potential_numeric"),
      getNum: (c) => num(inv(c) ?? null, "return_potential_numeric"),
      better: "higher",
    },
    {
      label: "Valuation",
      getVal: (c) => str(val(c) ?? null, "valuation_status"),
    },
    {
      label: "Signal",
      getVal: (c) => {
        const sig = getSignal(c.analysis as Record<string, unknown>);
        if (!sig) return null;
        return (
          <span
            className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-medium ${
              sig === "buy" ? "bg-emerald-100 text-emerald-800" : sig === "sell" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
            }`}
          >
            {signalLabel[sig as Signal]}
          </span>
        );
      },
    },
    {
      label: "Risk",
      getVal: (c) => {
        const risk = getRiskTier(c.analysis as Record<string, unknown>);
        if (!risk) return null;
        return (
          <span
            className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-medium ${
              risk === "low" ? "bg-sky-100 text-sky-800" : risk === "high" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
            }`}
          >
            {riskTierLabel[risk as RiskTier]}
          </span>
        );
      },
    },
    {
      label: "Entry timing",
      getVal: (c) => str(fin(c) ?? null, "entry_timing"),
    },
    {
      label: "Short-term outlook",
      getVal: (c) => str(short(c) ?? null, "strategy") || str(short(c) ?? null, "growth_probability"),
    },
    {
      label: "Mid-term return",
      getVal: (c) => str(mid(c) ?? null, "expected_annual_return"),
    },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
      <div className="grid grid-cols-[1fr_1fr_1fr] gap-0 border-b border-stone-200 bg-stone-50/80">
        <div className="p-4 font-medium text-stone-500">Metric</div>
        <div className="border-l border-stone-200 p-4 text-center">
          <Link to={`/company/${companyA.symbol}`} className="font-mono font-semibold text-teal-600 hover:text-teal-700">
            {companyA.symbol}
          </Link>
          <div className="mt-0.5 truncate text-xs text-stone-500" title={companyA.name}>{companyA.name}</div>
        </div>
        <div className="border-l border-stone-200 p-4 text-center">
          <Link to={`/company/${companyB.symbol}`} className="font-mono font-semibold text-teal-600 hover:text-teal-700">
            {companyB.symbol}
          </Link>
          <div className="mt-0.5 truncate text-xs text-stone-500" title={companyB.name}>{companyB.name}</div>
        </div>
      </div>
      {rows.map((row, i) => {
        const valA = row.getVal(companyA);
        const valB = row.getVal(companyB);
        if (valA == null && valB == null) return null;
        const numA = row.getNum?.(companyA) ?? null;
        const numB = row.getNum?.(companyB) ?? null;
        const aWins = row.better && numA != null && numB != null
          ? row.better === "higher"
            ? numA > numB
            : numA < numB
          : false;
        const bWins = row.better && numA != null && numB != null
          ? row.better === "higher"
            ? numB > numA
            : numB < numA
          : false;
        return (
          <div
            key={row.label}
            className={`grid grid-cols-[1fr_1fr_1fr] gap-0 border-b border-stone-100 last:border-b-0 ${i % 2 === 1 ? "bg-stone-50/50" : ""}`}
          >
            <div className="p-3 text-sm text-stone-600">{row.label}</div>
            <div className={`border-l border-stone-100 p-3 text-sm ${aWins ? "bg-teal-50/80 font-medium text-teal-800" : "text-stone-800"}`}>
              {valA != null && valA !== "" ? valA : <span className="text-stone-400">—</span>}
            </div>
            <div className={`border-l border-stone-100 p-3 text-sm ${bWins ? "bg-teal-50/80 font-medium text-teal-800" : "text-stone-800"}`}>
              {valB != null && valB !== "" ? valB : <span className="text-stone-400">—</span>}
            </div>
          </div>
        );
      })}
      <div className="flex border-t border-stone-200 bg-stone-50/80">
        <div className="flex-1 p-3 text-center">
          <Link
            to={`/company/${companyA.symbol}`}
            className="text-sm font-medium text-teal-600 hover:text-teal-700"
          >
            Full analysis →
          </Link>
        </div>
        <div className="w-px bg-stone-200" />
        <div className="flex-1 p-3 text-center">
          <Link
            to={`/company/${companyB.symbol}`}
            className="text-sm font-medium text-teal-600 hover:text-teal-700"
          >
            Full analysis →
          </Link>
        </div>
      </div>
    </div>
  );
}

export function Compare() {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramSymbols = searchParams.get("symbols") ?? "";
  const [symbolA, symbolB] = paramSymbols.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const [inputA, setInputA] = useState(symbolA || "");
  const [inputB, setInputB] = useState(symbolB || "");
  const [companyA, setCompanyA] = useState<Company | null>(null);
  const [companyB, setCompanyB] = useState<Company | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // SEO: compare page meta
  useEffect(() => {
    const title = "Compare NEPSE Stocks – Side-by-Side Stock Analysis | NEPSE Research";
    const description =
      "Compare two NEPSE-listed stocks side by side by price, valuation, risk, return potential, and outlook. AI-based analysis, not investment advice.";

    updatePageMeta({
      title,
      description,
      keywords: "NEPSE stock comparison, compare Nepal stocks, stock analysis comparison, NEPSE side by side",
      url: `${window.location.origin}/compare`,
      canonicalUrl: `${window.location.origin}/compare`,
    });

    addJsonLd(
      createBreadcrumbSchema([
        { name: "Home", url: `${window.location.origin}/` },
        { name: "Compare", url: `${window.location.origin}/compare` },
      ])
    );
  }, []);

  useEffect(() => {
    setInputA(symbolA || "");
    setInputB(symbolB || "");
  }, [symbolA, symbolB]);

  useEffect(() => {
    const a = symbolA || "";
    const b = symbolB || "";
    if (!a || !b) {
      setCompanyA(null);
      setCompanyB(null);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([api.getCompany(a), api.getCompany(b)])
      .then(([cA, cB]) => {
        setCompanyA(cA);
        setCompanyB(cB);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load companies.");
        setCompanyA(null);
        setCompanyB(null);
      })
      .finally(() => setLoading(false));
  }, [symbolA, symbolB]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const a = inputA.trim().toUpperCase();
    const b = inputB.trim().toUpperCase();
    if (!a || !b) return;
    setSearchParams({ symbols: `${a},${b}` });
  };

  const hasBoth = symbolA && symbolB;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl font-semibold text-stone-900">Compare companies</h1>
        <p className="mt-1 text-sm text-stone-500">Side-by-side metrics and outlook for two NEPSE stocks. Better values are highlighted.</p>
      </header>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-stone-500">First symbol</span>
            <input
              type="text"
              value={inputA}
              onChange={(e) => setInputA(e.target.value.toUpperCase())}
              placeholder="e.g. NABIL"
              className="w-28 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-stone-900 placeholder:text-stone-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 sm:w-32"
            />
          </label>
          <span className="hidden pb-2.5 text-stone-400 sm:inline">vs</span>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-stone-500">Second symbol</span>
            <input
              type="text"
              value={inputB}
              onChange={(e) => setInputB(e.target.value.toUpperCase())}
              placeholder="e.g. CBL"
              className="w-28 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-stone-900 placeholder:text-stone-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 sm:w-32"
            />
          </label>
          <button
            type="submit"
            disabled={!inputA.trim() || !inputB.trim()}
            className="rounded-xl bg-teal-600 px-5 py-2.5 font-medium text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Compare
          </button>
        </div>
      </form>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-stone-200/80 bg-white py-16 shadow-sm">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-200 border-t-teal-600" />
          <p className="mt-3 text-sm text-stone-500">Loading companies…</p>
        </div>
      )}

      {!loading && companyA && companyB && (
        <CompareTable companyA={companyA} companyB={companyB} />
      )}

      {!loading && hasBoth && !companyA && !companyB && !error && (
        <div className="rounded-2xl border border-stone-200/80 bg-stone-50/50 py-12 text-center text-sm text-stone-500">
          Enter two symbols above and click Compare.
        </div>
      )}

      {!loading && !hasBoth && (
        <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50/30 py-12 text-center text-sm text-stone-500">
          Enter two stock symbols (e.g. NABIL, CBL) and click Compare to see a side-by-side view.
        </div>
      )}
    </div>
  );
}
