"""Schema for market sentiment API."""

from pydantic import BaseModel


class MarketSentimentStats(BaseModel):
    stocks_with_data: int
    avg_pct_change: float | None
    stocks_up: int
    stocks_down: int


class MarketSentimentResponse(BaseModel):
    sentiment: str
    label: str
    summary: str
    stats: MarketSentimentStats
