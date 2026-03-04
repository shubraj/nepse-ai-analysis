"""Company and analysis model."""

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, String
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    sector: Mapped[str | None] = mapped_column(String(255), nullable=True)
    raw_detail: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    analysis: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def overview(self) -> dict[str, Any] | None:
        """Current stats from raw_detail for API."""
        if not self.raw_detail or not isinstance(self.raw_detail, dict):
            return None
        return self.raw_detail.get("overview")

    def __repr__(self) -> str:
        return f"<Company {self.symbol} {self.name}>"
