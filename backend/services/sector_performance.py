"""Sector performance: avg pct_change and up/down counts per sector."""

import re
from collections import defaultdict
from typing import Any

from sqlalchemy.orm import Session

from models.company import Company


def _parse_pct_change(overview: dict[str, Any] | None) -> float | None:
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


def get_sector_performance(db: Session) -> list[dict[str, Any]]:
    """Return list of { sector, avg_pct_change, stocks_up, stocks_down, count } sorted by avg_pct_change desc."""
    companies = db.query(Company).filter(Company.raw_detail.isnot(None), Company.sector.isnot(None), Company.sector != "").all()
    by_sector: dict[str, list[float]] = defaultdict(list)

    for c in companies:
        sector = (c.sector or "").strip()
        if not sector:
            continue
        ov = c.overview if getattr(c, "overview", None) else ((c.raw_detail or {}).get("overview") if c.raw_detail else None)
        pct = _parse_pct_change(ov)
        if pct is not None:
            by_sector[sector].append(pct)

    result = []
    for sector, values in by_sector.items():
        if not values:
            continue
        avg = round(sum(values) / len(values), 2)
        up = sum(1 for v in values if v > 0)
        down = sum(1 for v in values if v < 0)
        result.append({
            "sector": sector,
            "avg_pct_change": avg,
            "stocks_up": up,
            "stocks_down": down,
            "count": len(values),
        })
    result.sort(key=lambda x: (-(x["avg_pct_change"] or 0), x["sector"]))
    return result
