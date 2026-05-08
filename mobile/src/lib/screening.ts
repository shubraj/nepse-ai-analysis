/** Screening labels. Display: Signal (Buy/Hold/Sell) + Risk only. */

export type RiskTier = "low" | "moderate" | "high";
export type Investability = "high" | "moderate" | "low";
export type EntryTiming = "now" | "wait" | "avoid";
export type Signal = "buy" | "hold" | "sell";

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

export function getRiskTier(analysis: Record<string, unknown> | null | undefined): RiskTier | null {
  const fin = analysis?.final_decision as Record<string, unknown> | undefined;
  if (fin?.risk_tier) {
    const v = String(fin.risk_tier).trim().toLowerCase();
    if (v === "low" || v === "moderate" || v === "high") return v as RiskTier;
  }
  const n = num(analysis as Record<string, unknown>, "investment_snapshot", "risk_score_numeric");
  if (n == null) return null;
  if (n <= 4) return "low";
  if (n <= 6) return "moderate";
  return "high";
}

export function getInvestability(analysis: Record<string, unknown> | null | undefined): Investability | null {
  const fin = analysis?.final_decision as Record<string, unknown> | undefined;
  if (fin?.investability_label) {
    const v = String(fin.investability_label).trim().toLowerCase();
    if (v === "high" || v === "moderate" || v === "low") return v as Investability;
  }
  const q = num(analysis as Record<string, unknown>, "investment_snapshot", "investment_quality_score_numeric");
  const c = num(analysis as Record<string, unknown>, "final_decision", "confidence_score_numeric");
  if (q == null && c == null) return null;
  const avg = q != null && c != null ? (q + c) / 2 : (q ?? c ?? 0);
  if (avg >= 7) return "high";
  if (avg >= 4) return "moderate";
  return "low";
}

export function getEntryTiming(analysis: Record<string, unknown> | null | undefined): EntryTiming | null {
  const fin = analysis?.final_decision as Record<string, unknown> | undefined;
  if (fin?.entry_timing) {
    const v = String(fin.entry_timing).trim().toLowerCase();
    if (v === "now" || v === "wait" || v === "avoid") return v as EntryTiming;
  }
  const n = num(analysis as Record<string, unknown>, "final_decision", "invest_score_numeric");
  if (n == null) return null;
  if (n >= 0.5) return "now";
  if (n > 0) return "wait";
  return "avoid";
}

export const riskTierLabel: Record<RiskTier, string> = {
  low: "Low Risk",
  moderate: "Moderate Risk",
  high: "High Risk",
};

export const investabilityLabel: Record<Investability, string> = {
  high: "High Quality",
  moderate: "Moderate Quality",
  low: "Low Quality",
};

export const entryTimingLabel: Record<EntryTiming, string> = {
  now: "Buy",
  wait: "Hold",
  avoid: "Sell",
};

export function getSignal(analysis: Record<string, unknown> | null | undefined): Signal | null {
  const timing = getEntryTiming(analysis);
  if (!timing) return null;
  if (timing === "now") return "buy";
  if (timing === "wait") return "hold";
  return "sell";
}

export const signalLabel: Record<Signal, string> = {
  buy: "Buy",
  hold: "Hold",
  sell: "Sell",
};
