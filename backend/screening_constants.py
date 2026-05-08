"""Screening thresholds: risk 1-4 low, 5-6 moderate, 7-10 high; investability from quality/confidence avg; entry_timing from invest_score."""

from typing import Any


def _num(analysis: dict[str, Any] | None, *path: str) -> float | None:
    if not analysis:
        return None
    d = analysis
    for key in path[:-1]:
        d = d.get(key) if isinstance(d, dict) else None
        if not isinstance(d, dict):
            return None
    v = d.get(path[-1])
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def risk_tier_from_score(risk_score: float | None) -> str | None:
    if risk_score is None:
        return None
    if risk_score <= 4:
        return "low"
    if risk_score <= 6:
        return "moderate"
    return "high"


def investability_from_scores(
    quality_score: float | None,
    confidence_score: float | None,
) -> str | None:
    if quality_score is None and confidence_score is None:
        return None
    if quality_score is not None and confidence_score is not None:
        avg = (quality_score + confidence_score) / 2
    elif quality_score is not None:
        avg = quality_score
    else:
        avg = confidence_score or 0
    if avg >= 7:
        return "high"
    if avg >= 4:
        return "moderate"
    return "low"


def entry_timing_from_score(invest_score: float | None) -> str | None:
    if invest_score is None:
        return None
    if invest_score >= 0.5:
        return "now"
    if invest_score > 0:
        return "wait"
    return "avoid"


def recommendation_from_entry_timing(entry_timing: str | None) -> str | None:
    if not entry_timing:
        return None
    e = entry_timing.lower()
    if e == "now":
        return "Buy"
    if e == "wait":
        return "Hold"
    if e == "avoid":
        return "Sell"
    return None


def final_decision_from_numerics(analysis: dict[str, Any]) -> dict[str, str | None]:
    """Build risk_tier, investability_label, entry_timing, recommendation from numerics (title-case)."""
    inv = analysis.get("investment_snapshot") or {}
    fin = analysis.get("final_decision") or {}
    risk_n = _num(analysis, "investment_snapshot", "risk_score_numeric")
    quality_n = _num(inv, "investment_quality_score_numeric")
    confidence_n = _num(fin, "confidence_score_numeric")
    invest_n = _num(fin, "invest_score_numeric")

    risk_tier = risk_tier_from_score(risk_n)
    investability = investability_from_scores(quality_n, confidence_n)
    entry_timing = entry_timing_from_score(invest_n)
    recommendation = recommendation_from_entry_timing(entry_timing)

    def title(s: str | None) -> str | None:
        return s.capitalize() if s else None

    return {
        "risk_tier": title(risk_tier) if risk_tier else None,
        "investability_label": title(investability) if investability else None,
        "entry_timing": title(entry_timing) if entry_timing else None,
        "recommendation": recommendation,
    }
