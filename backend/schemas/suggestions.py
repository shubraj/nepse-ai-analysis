"""Pydantic schemas for investment suggestions API."""

from pydantic import BaseModel


class SuggestionItem(BaseModel):
    symbol: str
    name: str
    sector: str
    suggested_amount_npr: int
    allocation_pct: float
    recommendation: str
    risk_tier: str
    outlook_label: str
    expected_return_pct: float | None = None


class SuggestionsResponse(BaseModel):
    suggestions: list[SuggestionItem]
    expected_overall_return_pct: float | None = None
