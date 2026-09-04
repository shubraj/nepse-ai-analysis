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


DEFAULT_FACE_VALUE = 100.0


def get_dividend_events(
    dividend_history: list[dict[str, Any]],
    face_value: float = DEFAULT_FACE_VALUE,
) -> list[dict[str, Any]]:
    """
    Cash dividend events, Rs per share. Nepali dividend % is a percentage of
    the company's paid-up (face) value per share — usually Rs 100, but not
    always (e.g. some funds/promoter shares use Rs 10 or Rs 50), so a 12.50%
    dividend on a Rs 100 face value share is Rs 12.50/share, while the same
    12.50% on a Rs 10 face value share is only Rs 1.25/share.
    Dates are approximate (fiscal-year-end) since Merolagani only gives the BS
    fiscal year, not an exact AD ex-dividend date.
    """
    if not face_value or face_value <= 0:
        face_value = DEFAULT_FACE_VALUE

    events: list[dict[str, Any]] = []
    for row in dividend_history or []:
        pct = parse_dividend_pct(row.get("value", ""))
        date = bs_fy_to_approx_ad_date(row.get("fiscal_year", ""))
        if pct and pct > 0 and date:
            events.append({
                "date": date,
                "amount_per_share": round(pct / 100 * face_value, 2),
                "fiscal_year": (row.get("fiscal_year") or "").strip(),
            })
    events.sort(key=lambda e: e["date"])
    return events
