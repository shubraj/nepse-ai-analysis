const API_BASE =
  typeof import.meta.env.VITE_API_URL === "string"
    ? import.meta.env.VITE_API_URL
    : "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const p = path.startsWith("/") ? path : `/${path}`;
  const url = path.startsWith("http") ? path : `${API_BASE.replace(/\/$/, "")}${p}`;
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const d = (err as { detail?: string | unknown[] }).detail;
    const message =
      typeof d === "string"
        ? d
        : Array.isArray(d) && d.length > 0 && d[0] && typeof (d[0] as { msg?: string }).msg === "string"
          ? (d[0] as { msg: string }).msg
          : "Request failed";
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listSectors: () => request<string[]>("/companies/sectors"),
  listCompanies: (params?: {
    skip?: number;
    limit?: number;
    q?: string;
    risk_tier?: string;
    investability?: string;
    entry_timing?: string;
    sector?: string;
  }) => {
    const sp = new URLSearchParams();
    if (params?.skip != null) sp.set("skip", String(params.skip));
    if (params?.limit != null) sp.set("limit", String(params.limit));
    if (params?.q) sp.set("q", params.q);
    if (params?.risk_tier) sp.set("risk_tier", params.risk_tier);
    if (params?.investability) sp.set("investability", params.investability);
    if (params?.entry_timing) sp.set("entry_timing", params.entry_timing);
    if (params?.sector) sp.set("sector", params.sector);
    const query = sp.toString();
    return request<import("../types/company").Company[]>(`/companies${query ? `?${query}` : ""}`);
  },
  getCompany: (symbol: string, params?: { analysis_date?: string }) => {
    const sp = new URLSearchParams();
    if (params?.analysis_date) sp.set("analysis_date", params.analysis_date);
    const q = sp.toString();
    return request<import("../types/company").Company>(
      `/companies/${encodeURIComponent(symbol)}${q ? `?${q}` : ""}`
    );
  },
  listCompanyAnalyses: (symbol: string) =>
    request<import("../types/company").CompanyAnalysisListItem[]>(
      `/companies/${encodeURIComponent(symbol)}/analyses`
    ),
  getCompanyAnalysis: (symbol: string, analysisId: number) =>
    request<import("../types/company").CompanyAnalysisResponse>(
      `/companies/${encodeURIComponent(symbol)}/analyses/${analysisId}`
    ),
  getSuggestions: (params: { amount_npr: number; goal: "short_term" | "mid_term" | "long_term"; max_stocks?: number }) => {
    const sp = new URLSearchParams();
    sp.set("amount_npr", String(params.amount_npr));
    sp.set("goal", params.goal);
    if (params.max_stocks != null) sp.set("max_stocks", String(params.max_stocks));
    return request<import("../types/company").SuggestionsResponse>(`/suggestions?${sp.toString()}`);
  },
  getMarketSentiment: () =>
    request<import("../types/company").MarketSentimentResponse>("/market-sentiment"),
  getSectorPerformance: () =>
    request<import("../types/company").SectorPerformanceResponse>("/sector-performance"),
  getMarketPrediction: () =>
    request<import("../types/company").MarketPredictionResponse>("/market-prediction"),
};
