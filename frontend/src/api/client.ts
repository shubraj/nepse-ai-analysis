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
    throw new Error((err as { detail?: string }).detail ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

export const api = {
  listCompanies: (params?: {
    skip?: number;
    limit?: number;
    q?: string;
    risk_tier?: string;
    investability?: string;
    entry_timing?: string;
  }) => {
    const sp = new URLSearchParams();
    if (params?.skip != null) sp.set("skip", String(params.skip));
    if (params?.limit != null) sp.set("limit", String(params.limit));
    if (params?.q) sp.set("q", params.q);
    if (params?.risk_tier) sp.set("risk_tier", params.risk_tier);
    if (params?.investability) sp.set("investability", params.investability);
    if (params?.entry_timing) sp.set("entry_timing", params.entry_timing);
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
};
