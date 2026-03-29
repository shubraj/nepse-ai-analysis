"""Pydantic schema for MarketPrediction API."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class MarketPredictionResponse(BaseModel):
    """Market prediction response with flattened prediction fields."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    predicted_at: str
    prediction_for: str
    sentiment: str = "neutral"
    direction: str = "flat"
    confidence: int = 5
    predicted_change_pct: str = "0"
    key_factors: list[str] = Field(default_factory=list)
    summary: str = "Prediction unavailable"
