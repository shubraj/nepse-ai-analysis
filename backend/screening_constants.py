"""Screening thresholds and local score computation from raw financial data."""

import re as _re
from typing import Any


# ---------------------------------------------------------------------------
# Sector benchmarks
# ---------------------------------------------------------------------------

_SECTOR_PE: dict[str, tuple[float, float]] = {
    "banking": (15.0, 30.0),
    "insurance": (20.0, 35.0),
    "hydropower": (10.0, 20.0),
    "finance": (10.0, 25.0),
    "other": (8.0, 30.0),
}

_SECTOR_PBV: dict[str, tuple[float, float]] = {
    "banking": (0.8, 2.5),
    "insurance": (1.0, 3.0),
    "hydropower": (0.5, 1.5),
    "finance": (1.0, 3.0),
    "other": (0.5, 2.5),
}

_SECTOR_RISK_BASE: dict[str, float] = {
    "banking": 4.0,
    "insurance": 5.0,
    "hydropower": 5.0,
    "finance": 5.0,
    "other": 5.0,
}

_GP_LABEL = {5: "Very High", 4: "High", 3: "Moderate", 2: "Low", 1: "Very Low"}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _to_num(v: Any) -> float | None:
    if v is None:
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    m = _re.search(r"-?\d+\.?\d*", str(v))
    return float(m.group(0)) if m else None


def _clamp(v: float, lo: float, hi: float) -> int:
    return int(max(lo, min(hi, round(v))))


def _detect_sector_type(raw_detail: dict[str, Any]) -> str:
    about = raw_detail.get("about") or {}
    overview = raw_detail.get("overview") or {}
    sector = (about.get("sector") or overview.get("sector") or "").lower()
    if any(k in sector for k in ("bank", "commercial")):
        return "banking"
    if "insurance" in sector:
        return "insurance"
    if any(k in sector for k in ("hydro", "power", "energy")):
        return "hydropower"
    if any(k in sector for k in ("finance", "microfinance", "laghubitta")):
        return "finance"
    return "other"


def _ret_label(lo: int, hi: int, suffix: str = "") -> str:
    sign = "+" if lo >= 0 else ""
    return f"{sign}{lo}% to +{hi}%{suffix}"


# ---------------------------------------------------------------------------
# Main scorer — replaces LLM for all numeric/categorical fields
# ---------------------------------------------------------------------------

def compute_scores_from_raw(raw_detail: dict[str, Any]) -> dict[str, Any]:
    """
    Compute all numeric investment scores from raw financial data.
    Returns the full analysis structure with None for text-only fields
    (those are filled later by a small LLM call).
    """
    overview = raw_detail.get("overview") or {}
    dividends = raw_detail.get("dividend_history") or []

    pe = _to_num(overview.get("p_e_ratio") or overview.get("pe_ratio"))
    pbv = _to_num(overview.get("pbv"))
    eps = _to_num(overview.get("eps"))
    price = _to_num(overview.get("market_price"))
    div_years = sum(1 for d in dividends[:5] if d.get("value") or d.get("fiscal_year"))

    st = _detect_sector_type(raw_detail)
    pe_lo, pe_hi = _SECTOR_PE[st]
    pbv_lo, pbv_hi = _SECTOR_PBV[st]

    # Valuation score: 1=Undervalued, 0=Fairly Valued, -1=Overvalued
    val_score = 0
    if pe is not None:
        if pe < pe_lo * 0.8:
            val_score = 1
        elif pe > pe_hi * 1.25:
            val_score = -1
    if pbv is not None:
        if pbv < pbv_lo * 0.75 and val_score >= 0:
            val_score = 1
        elif pbv > pbv_hi * 1.5 and val_score <= 0:
            val_score = -1

    valuation_status = {1: "Undervalued", 0: "Fairly Valued", -1: "Overvalued"}[val_score]

    # Quality score (1-10)
    quality = 5.0 + val_score * 2.0 + min(div_years, 5) * 0.4
    if eps is not None:
        quality += 0.5 if eps > 0 else -2.0
    if pbv is not None:
        if pbv < pbv_lo:
            quality += 0.5
        elif pbv > pbv_hi * 1.5:
            quality -= 1.0
    quality_n = _clamp(quality, 1, 10)

    # Risk score (1-10)
    risk = _SECTOR_RISK_BASE[st]
    if pe is None:
        risk += 1.0
    elif pe > pe_hi * 1.5:
        risk += 2.0
    elif pe < 5:
        risk += 1.0
    if pbv is not None and pbv > pbv_hi * 1.5:
        risk += 0.5
    if div_years == 0:
        risk += 0.5
    if eps is not None and eps < 0:
        risk += 2.0
    risk_n = _clamp(risk, 1, 10)

    # Return potential (1-10)
    ret = {1: 7, 0: 5, -1: 3}[val_score]
    if quality_n >= 7:
        ret += 1
    elif quality_n <= 3:
        ret -= 1
    if div_years >= 3:
        ret += 1
    ret_n = _clamp(ret, 1, 10)

    # Confidence (1-9 — can't be 10 from rules alone, no income statement)
    conf = 0
    if pe is not None:
        conf += 3
    if pbv is not None:
        conf += 2
    if eps is not None:
        conf += 2
    if div_years >= 1:
        conf += 1
    if div_years >= 3:
        conf += 1
    conf_n = _clamp(conf, 1, 9)

    # Dividend consistency (1-10)
    div_consistency = [1, 3, 5, 6, 8, 9][min(div_years, 5)]
    income_reliability = max(1, div_consistency - 1)
    suitable_for_income = div_consistency >= 6

    # Invest score (0 / 0.5 / 1)
    if quality_n >= 6 and risk_n <= 5 and val_score >= 0:
        invest_n = 1.0
    elif quality_n >= 4 and risk_n <= 7:
        invest_n = 0.5
    else:
        invest_n = 0.0

    # Volatility
    volatility_n = _clamp(risk_n * 0.85, 1, 10)

    # Outlook return ranges
    short_range = {1: (5, 20), 0: (-5, 12), -1: (-15, 5)}[val_score]
    mid_range = {1: (5, 18), 0: (0, 10), -1: (-5, 5)}[val_score]
    long_range = {1: (7, 25), 0: (5, 12), -1: (0, 8)}[val_score]

    gp_short = 4 if (val_score == 1 and quality_n >= 6) else (3 if val_score >= 0 else 2)
    gp_mid = gp_short
    gp_long = 4 if quality_n >= 7 else (3 if quality_n >= 5 else 2)

    conf_label = "High" if conf_n >= 8 else ("Moderate" if conf_n >= 5 else "Low")

    return {
        "ticker_symbol": (raw_detail.get("symbol") or "").upper(),
        "company_name": (raw_detail.get("about") or {}).get("company_name") or raw_detail.get("company_display_name") or "",
        "sector": (raw_detail.get("about") or {}).get("sector") or (raw_detail.get("overview") or {}).get("sector") or "",
        "market_position": None,  # LLM
        "investment_snapshot": {
            "investment_quality_score_numeric": quality_n,
            "risk_score_numeric": risk_n,
            "return_potential_numeric": ret_n,
            "investment_quality_score": ("High Quality" if quality_n >= 8 else "Above Average" if quality_n >= 6 else "Average" if quality_n >= 4 else "Below Average"),
            "risk_level": ("Low Risk" if risk_n <= 3 else "Moderate Risk" if risk_n <= 6 else "High Risk"),
            "return_potential": ("High Potential" if ret_n >= 7 else "Moderate Potential" if ret_n >= 5 else "Low Potential"),
            "suitability": None,  # LLM
        },
        "valuation_analysis": {
            "valuation_status": valuation_status,
            "valuation_score_numeric": val_score,
            "value_or_growth_style": ("Value" if val_score == 1 else "Growth" if risk_n <= 5 else "Blend"),
            "pe_interpretation": None,   # LLM
            "pb_interpretation": None,   # LLM
        },
        "short_term_outlook_0_to_12_months": {
            "growth_probability_numeric": gp_short,
            "growth_probability": _GP_LABEL[gp_short],
            "expected_return_low_pct": short_range[0],
            "expected_return_high_pct": short_range[1],
            "expected_price_range_change": _ret_label(*short_range),
            "key_triggers": [],
            "key_drivers": [],
            "strategy": None,  # LLM
        },
        "mid_term_outlook_1_to_3_years": {
            "growth_probability_numeric": gp_mid,
            "growth_probability": _GP_LABEL[gp_mid],
            "expected_annual_return_min_pct": mid_range[0],
            "expected_annual_return_max_pct": mid_range[1],
            "expected_annual_return": _ret_label(*mid_range, " p.a."),
            "key_drivers": [],
            "key_triggers": [],
            "strategy": None,  # LLM
        },
        "long_term_outlook_3_to_5_years": {
            "growth_probability_numeric": gp_long,
            "growth_probability": _GP_LABEL[gp_long],
            "expected_annual_return_best_case_min_pct": long_range[0],
            "expected_annual_return_best_case_max_pct": long_range[1],
            "expected_annual_return_best_case": _ret_label(*long_range, " p.a. best case"),
            "long_term_risk_score_numeric": _clamp(risk_n * 0.9, 1, 10),
            "investment_theme": None,  # LLM
            "long_term_risk": None,    # LLM
        },
        "dividend_profile": {
            "dividend_consistency_score_numeric": div_consistency,
            "income_reliability_score_numeric": income_reliability,
            "suitable_for_income_investors": suitable_for_income,
            "dividend_consistency": ("Excellent" if div_consistency >= 8 else "Good" if div_consistency >= 6 else "Moderate" if div_consistency >= 4 else "Poor" if div_consistency >= 2 else "No History"),
            "income_reliability": ("High" if income_reliability >= 7 else "Moderate" if income_reliability >= 4 else "Low"),
        },
        "financial_strength_monitoring": {
            "eps_trend": ("Positive EPS" if eps is not None and eps > 0 else "Negative EPS" if eps is not None else None),
            "capital_strength": None,
            "asset_quality": None,
            "liquidity_position": None,
        },
        "risk_analysis": {
            "primary_risks": [],  # LLM
            "volatility_level": ("Low" if volatility_n <= 3 else "Moderate" if volatility_n <= 6 else "High"),
            "volatility_score_numeric": volatility_n,
        },
        "portfolio_strategy_recommendation": {
            "allocation_size": ("Small (2-4%)" if risk_n >= 7 else "Moderate (4-7%)" if risk_n >= 5 else "Standard (5-10%)"),
            "allocation_max_pct_numeric": (4 if risk_n >= 7 else 7 if risk_n >= 5 else 10),
            "holding_period": ("1-2 years" if invest_n < 0.5 else "3-5 years"),
            "holding_period_years_numeric": (1 if invest_n == 0.0 else 2 if invest_n == 0.5 else 4),
            "buy_strategy": None,
        },
        "who_should_invest": [],
        "who_should_avoid": [],
        "final_decision": {
            "invest_score_numeric": invest_n,
            "invest_now": ("Yes" if invest_n == 1.0 else "Conditional" if invest_n == 0.5 else "No"),
            "confidence_score_numeric": conf_n,
            "confidence_level": conf_label,
            "risk_tier": ("Low" if risk_n <= 4 else "Moderate" if risk_n <= 6 else "High"),
            "investability_label": ("High" if (quality_n + conf_n) / 2 >= 7 else "Moderate" if (quality_n + conf_n) / 2 >= 4 else "Low"),
            "entry_timing": ("Now" if invest_n == 1.0 else "Wait" if invest_n == 0.5 else "Avoid"),
            "recommendation": ("Consider" if invest_n == 1.0 else "Watch" if invest_n == 0.5 else "Avoid"),
            "summary_verdict": None,  # LLM
            "wait_option": None,
        },
    }


# ---------------------------------------------------------------------------
# Screening helpers (unchanged)
# ---------------------------------------------------------------------------

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


def company_matches(
    analysis: dict[str, Any] | None,
    risk_tier: str | None = None,
    investability: str | None = None,
    entry_timing: str | None = None,
) -> bool:
    if analysis is None:
        return False
    fd = analysis.get("final_decision") or {}
    if risk_tier and (fd.get("risk_tier") or "").lower() != risk_tier:
        return False
    if investability and (fd.get("investability_label") or "").lower() != investability:
        return False
    if entry_timing and (fd.get("entry_timing") or "").lower() != entry_timing:
        return False
    return True
