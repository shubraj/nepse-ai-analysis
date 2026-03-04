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
