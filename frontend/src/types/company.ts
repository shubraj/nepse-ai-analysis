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
  sector: string | null;
  overview: Record<string, string | number> | null;
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

export interface MarketSentimentStats {
  stocks_with_data: number;
  avg_pct_change: number | null;
  stocks_up: number;
  stocks_down: number;
}

export interface MarketSentimentResponse {
  sentiment: string;
  label: string;
  summary: string;
  stats: MarketSentimentStats;
}

export interface MarketPredictionResponse {
  id: number;
  predicted_at: string;
  prediction_for: string;
  sentiment: string;
  direction: string;
  confidence: number;
  predicted_change_pct: string;
  key_factors: string[];
  summary: string;
}

export interface SectorPerformanceItem {
  sector: string;
  avg_pct_change: number;
  stocks_up: number;
  stocks_down: number;
  count: number;
}

export interface SectorPerformanceResponse {
  sectors: SectorPerformanceItem[];
}

export interface PageViewCountResponse {
  total: number;
}

export interface PricePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
