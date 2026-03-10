"""Schema for sector performance API."""

from pydantic import BaseModel


class SectorPerformanceItem(BaseModel):
    sector: str
    avg_pct_change: float
    stocks_up: int
    stocks_down: int
    count: int


class SectorPerformanceResponse(BaseModel):
    sectors: list[SectorPerformanceItem]
