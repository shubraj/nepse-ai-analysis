"""Market sentiment from recent price trend (pct_change) only."""

import re
from typing import Any

from sqlalchemy.orm import Session

from models.company import Company


def _parse_pct_change(overview: dict[str, Any] | None) -> float | None:
    """Parse percent change from overview (e.g. '+2.5%', '-1.2%') to float. Returns None if missing/invalid."""
    if not overview or not isinstance(overview, dict):
        return None
    raw = overview.get("pct_change") or overview.get("percent_change") or overview.get("pct_change_today")
    if raw is None:
        return None
    s = str(raw).strip().replace(",", "").replace("%", "").strip()
    if not s:
        return None
    try:
        return float(s)
    except (TypeError, ValueError):
        m = re.search(r"[-+]?\d*\.?\d+", str(raw))
        return float(m.group(0)) if m else None


def get_market_sentiment(db: Session) -> dict[str, Any]:
    """
    Compute market sentiment from recent price trend only (pct_change from overview).
    Uses all companies with price data for a more accurate market-wide view.
    """
    companies = db.query(Company).filter(Company.raw_detail.isnot(None)).all()
    pct_change_sum = 0.0
    pct_change_count = 0
    stocks_up = 0
    stocks_down = 0

    for c in companies:
        ov = c.overview if getattr(c, "overview", None) else ((c.raw_detail or {}).get("overview") if c.raw_detail else None)
        pct = _parse_pct_change(ov)
        if pct is not None:
            pct_change_sum += pct
            pct_change_count += 1
            if pct > 0:
                stocks_up += 1
            elif pct < 0:
                stocks_down += 1

    avg_pct_change = round(pct_change_sum / pct_change_count, 2) if pct_change_count else None

    if pct_change_count == 0 or avg_pct_change is None:
        sentiment = "neutral"
        label = "Neutral"
        summary = "No recent price data. Sync companies to see trend."
    elif avg_pct_change >= 0.5:
        sentiment = "bullish"
        label = "Bullish"
        summary = "Prices up on average."
    elif avg_pct_change <= -0.5:
        sentiment = "bearish"
        label = "Bearish"
        summary = "Prices down on average."
    elif avg_pct_change > 0:
        sentiment = "cautiously_optimistic"
        label = "Slightly positive"
        summary = "Modest gains on average."
    elif avg_pct_change < 0:
        sentiment = "cautious"
        label = "Slightly negative"
        summary = "Modest decline on average."
    else:
        sentiment = "neutral"
        label = "Neutral"
        summary = "Prices flat."

    return {
        "sentiment": sentiment,
        "label": label,
        "summary": summary,
        "stats": {
            "stocks_with_data": pct_change_count,
            "avg_pct_change": avg_pct_change,
            "stocks_up": stocks_up,
            "stocks_down": stocks_down,
        },
    }
