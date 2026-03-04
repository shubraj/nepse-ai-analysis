"""Screening labels from analysis: risk tier, investability, entry timing."""

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


def get_risk_tier(analysis: dict[str, Any] | None) -> str | None:
    """Return low, moderate, or high."""
    fin = analysis.get("final_decision") if isinstance(analysis, dict) else None
    if isinstance(fin, dict) and fin.get("risk_tier"):
        v = str(fin["risk_tier"]).strip().lower()
        if v in ("low", "moderate", "high"):
            return v
    n = _num(analysis, "investment_snapshot", "risk_score_numeric")
    if n is None:
        return None
    if n <= 3:
        return "low"
    if n <= 6:
        return "moderate"
    return "high"


def get_investability(analysis: dict[str, Any] | None) -> str | None:
    """Return high, moderate, or low."""
    fin = analysis.get("final_decision") if isinstance(analysis, dict) else None
    if isinstance(fin, dict) and fin.get("investability_label"):
        v = str(fin["investability_label"]).strip().lower()
        if v in ("high", "moderate", "low"):
            return v
    q = _num(analysis, "investment_snapshot", "investment_quality_score_numeric")
    c = _num(analysis, "final_decision", "confidence_score_numeric")
    if q is None and c is None:
        return None
    if q is not None and c is not None:
        avg = (q + c) / 2
    elif q is not None:
        avg = q
    else:
        avg = c
    if avg >= 7:
        return "high"
    if avg >= 4:
        return "moderate"
    return "low"


def get_entry_timing(analysis: dict[str, Any] | None) -> str | None:
    """Return now, wait, or avoid."""
    fin = analysis.get("final_decision") if isinstance(analysis, dict) else None
    if isinstance(fin, dict) and fin.get("entry_timing"):
        v = str(fin["entry_timing"]).strip().lower()
        if v in ("now", "wait", "avoid"):
            return v
    n = _num(analysis, "final_decision", "invest_score_numeric")
    if n is None:
        return None
    if n >= 0.5:
        return "now"
    if n > 0:
        return "wait"
    return "avoid"


def company_matches(
    analysis: dict[str, Any] | None,
    risk_tier: str | None = None,
    investability: str | None = None,
    entry_timing: str | None = None,
) -> bool:
    if not analysis:
        return False
    if risk_tier and get_risk_tier(analysis) != risk_tier.lower():
        return False
    if investability and get_investability(analysis) != investability.lower():
        return False
    if entry_timing and get_entry_timing(analysis) != entry_timing.lower():
        return False
    return True
