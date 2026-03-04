"""Pydantic schemas for Company API."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class CompanyBase(BaseModel):
    symbol: str
    name: str = ""
    sector: str | None = None


class CompanyCreate(CompanyBase):
    raw_detail: dict[str, Any] | None = None
    analysis: dict[str, Any] | None = None


class CompanyUpdate(BaseModel):
    name: str | None = None
    sector: str | None = None
    raw_detail: dict[str, Any] | None = None
    analysis: dict[str, Any] | None = None


class CompanyResponse(CompanyBase):
    """API response with overview (current stats from raw_detail)."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    analysis: dict[str, Any] | None = None
    overview: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime
