export interface Company {
  id: number;
  symbol: string;
  name: string;
  sector: string | null;
  overview: Record<string, string | number> | null;
  analysis: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyAnalysisListItem {
  id: number;
  analyzed_at: string;
}

export interface CompanyAnalysisResponse {
  id: number;
  company_id: number;
  analyzed_at: string;
  analysis: Record<string, unknown>;
}

export interface SuggestionItem {
  symbol: string;
  name: string;
  sector: string;
  suggested_amount_npr: number;
  allocation_pct: number;
  recommendation: string;
  risk_tier: string;
  outlook_label: string;
  expected_return_pct?: number | null;
  growth_potential?: string | null;
}

export interface SuggestionsResponse {
  suggestions: SuggestionItem[];
  expected_overall_return_pct?: number | null;
}
