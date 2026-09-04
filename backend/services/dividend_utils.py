"""Convert Merolagani's Nepali-fiscal-year dividend history into approximate AD dates."""

import re
from typing import Any


def bs_fy_to_approx_ad_date(fy_str: str) -> str | None:
    """'(FY: 081-082)' -> approx AD date 'YYYY-07-16' for that fiscal year's end (mid-Ashad)."""
    m = re.search(r"(\d{2,3})-(\d{2,3})", fy_str or "")
    if not m:
        return None
    try:
        end_bs_year = 2000 + int(m.group(2))
    except ValueError:
        return None
    ad_year = end_bs_year - 57
    return f"{ad_year}-07-16"


def parse_dividend_pct(value: str) -> float | None:
    m = re.search(r"[-+]?\d*\.?\d+", value or "")
    return float(m.group(0)) if m else None


def get_dividend_events(dividend_history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Cash dividend events, Rs per share. Nepali dividend % is expressed as a
    percentage of the Rs 100 par value, so a 12.50% dividend is Rs 12.50/share.
    Dates are approximate (fiscal-year-end) since Merolagani only gives the BS
    fiscal year, not an exact AD ex-dividend date.
    """
    events: list[dict[str, Any]] = []
    for row in dividend_history or []:
        pct = parse_dividend_pct(row.get("value", ""))
        date = bs_fy_to_approx_ad_date(row.get("fiscal_year", ""))
        if pct and pct > 0 and date:
            events.append({
                "date": date,
                "amount_per_share": round(pct, 2),
                "fiscal_year": (row.get("fiscal_year") or "").strip(),
            })
    events.sort(key=lambda e: e["date"])
    return events
