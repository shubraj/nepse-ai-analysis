"""PageView model for visitor tracking."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class PageView(Base):
    __tablename__ = "page_views"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    page: Mapped[str] = mapped_column(String(512), nullable=False, index=True)
    visitor_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    viewed_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, index=True)

    def __repr__(self) -> str:
        return f"<PageView {self.page}>"
