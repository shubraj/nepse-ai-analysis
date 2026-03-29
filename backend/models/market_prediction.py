"""Market prediction for tomorrow."""

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class MarketPrediction(Base):
    __tablename__ = "market_predictions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    predicted_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    prediction_for: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    prediction: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)

    def __repr__(self) -> str:
        return f"<MarketPrediction for {self.prediction_for}>"
