import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
            <div className="mt-2 flex flex-wrap gap-1.5">
              {risk && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    risk === "low" ? "bg-emerald-100 text-emerald-800" : risk === "high" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
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
                    timing === "now" ? "bg-emerald-100 text-emerald-800" : timing === "avoid" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
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
  );
}

export function Dashboard() {
  const [mostInvestable, setMostInvestable] = useState<Company[]>([]);
  const [lowRisk, setLowRisk] = useState<Company[]>([]);
  const [highRisk, setHighRisk] = useState<Company[]>([]);
  const [timeToInvest, setTimeToInvest] = useState<Company[]>([]);
  const [waitForEntry, setWaitForEntry] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.listCompanies({ limit: 10, investability: "high" }),
      api.listCompanies({ limit: 10, risk_tier: "low" }),
      api.listCompanies({ limit: 10, risk_tier: "high" }),
      api.listCompanies({ limit: 10, entry_timing: "now" }),
      api.listCompanies({ limit: 10, entry_timing: "wait" }),
    ])
      .then(([a, b, c, d, e]) => {
        if (!cancelled) {
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

  return (
    <div className="space-y-10">
      <header className="rounded-2xl border border-stone-200/80 bg-white px-6 py-8 text-center shadow-sm sm:py-10">
        <h1 className="font-display text-2xl font-semibold text-stone-900 sm:text-3xl">NEPSE Equity Research</h1>
        <p className="mx-auto mt-2 max-w-xl text-stone-600">
          Company analysis, risk profile, and entry timing for the Nepal stock market.
        </p>
        <p className="mx-auto mt-3 max-w-xl text-xs text-stone-500">
          AI-based analysis from historical data. Not professional investment advice. See footer disclaimer.
        </p>
        <Link
          to="/companies"
          className="mt-6 inline-block rounded-xl bg-teal-600 px-5 py-2.5 font-medium text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
        >
          Browse all companies
        </Link>
      </header>

      <section>
        <h2 className="font-display text-lg font-semibold text-stone-900">Most investable</h2>
        <p className="text-sm text-stone-500">High quality score and conviction. Suitable for core allocation.</p>
        <CompanyCardRow companies={mostInvestable} loading={loading} />
        {mostInvestable.length > 0 && (
          <Link to="/companies?investability=high" className="mt-2 inline-block text-sm font-medium text-teal-600 hover:text-teal-700">
            View all most investable →
          </Link>
        )}
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-stone-900">Low risk</h2>
        <p className="text-sm text-stone-500">Lower risk profile. Suitable for conservative investors.</p>
        <CompanyCardRow companies={lowRisk} loading={loading} />
        {lowRisk.length > 0 && (
          <Link to="/companies?risk_tier=low" className="mt-2 inline-block text-sm font-medium text-teal-600 hover:text-teal-700">
            View all low risk →
          </Link>
        )}
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-stone-900">High risk / High return</h2>
        <p className="text-sm text-stone-500">Higher volatility and return potential. For risk-tolerant investors.</p>
        <CompanyCardRow companies={highRisk} loading={loading} />
        {highRisk.length > 0 && (
          <Link to="/companies?risk_tier=high" className="mt-2 inline-block text-sm font-medium text-teal-600 hover:text-teal-700">
            View all high risk →
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
        <h2 className="font-display text-lg font-semibold text-stone-900">Wait for better entry</h2>
        <p className="text-sm text-stone-500">Partial or conditional. Wait for dips or clarity.</p>
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
