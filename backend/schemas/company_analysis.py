"""Pydantic schemas for CompanyAnalysis API."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class CompanyAnalysisResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    analyzed_at: datetime
    analysis: dict[str, Any]


class CompanyAnalysisListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    analyzed_at: datetime
