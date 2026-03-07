"""Investment suggestions by amount (NPR) and goal (short/mid/long term). Uses AI when available."""

import logging
from typing import Any

from sqlalchemy.orm import Session

from models.company import Company
from services.screening import get_entry_timing, get_risk_tier

logger = logging.getLogger(__name__)


def _num(analysis: dict[str, Any] | None, *path: str) -> float | None:
    if not analysis or not isinstance(analysis, dict):
        return None
    d: Any = analysis
    for key in path[:-1]:
        d = d.get(key) if isinstance(d, dict) else None
        if not isinstance(d, dict):
            return None
    v = d.get(path[-1]) if isinstance(d, dict) else None
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _goal_score(analysis: dict[str, Any] | None, goal: str) -> float:
    """Higher = better for this goal. 0 if no data."""
    if not analysis:
        return 0.0
    if goal == "short_term":
        growth = _num(analysis, "short_term_outlook_0_to_12_months", "growth_probability_numeric")
        high = _num(analysis, "short_term_outlook_0_to_12_months", "expected_return_high_pct")
        if growth is not None and high is not None:
            return growth * 10 + (high or 0)
        return (growth or 0) * 10
    if goal == "mid_term":
        growth = _num(analysis, "mid_term_outlook_1_to_3_years", "growth_probability_numeric")
        ret = _num(analysis, "mid_term_outlook_1_to_3_years", "expected_annual_return_max_pct")
        if growth is not None and ret is not None:
            return growth * 10 + (ret or 0)
        return (growth or 0) * 10
    if goal == "long_term":
        growth = _num(analysis, "long_term_outlook_3_to_5_years", "growth_probability_numeric")
        ret = _num(analysis, "long_term_outlook_3_to_5_years", "expected_annual_return_best_case_max_pct")
        if growth is not None and ret is not None:
            return growth * 10 + (ret or 0)
        return (growth or 0) * 10
    return 0.0


def _expected_return_pct(analysis: dict[str, Any] | None, goal: str) -> float | None:
    """Expected return % for this goal (midpoint or single value). Used for weighted overall return."""
    if not analysis:
        return None
    if goal == "short_term":
        low = _num(analysis, "short_term_outlook_0_to_12_months", "expected_return_low_pct")
        high = _num(analysis, "short_term_outlook_0_to_12_months", "expected_return_high_pct")
        if low is not None and high is not None:
            return (low + high) / 2
        return high if high is not None else low
    if goal == "mid_term":
        mn = _num(analysis, "mid_term_outlook_1_to_3_years", "expected_annual_return_min_pct")
        mx = _num(analysis, "mid_term_outlook_1_to_3_years", "expected_annual_return_max_pct")
        if mn is not None and mx is not None:
            return (mn + mx) / 2
        return mx if mx is not None else mn
    if goal == "long_term":
        mn = _num(analysis, "long_term_outlook_3_to_5_years", "expected_annual_return_best_case_min_pct")
        mx = _num(analysis, "long_term_outlook_3_to_5_years", "expected_annual_return_best_case_max_pct")
        if mn is not None and mx is not None:
            return (mn + mx) / 2
        return mx if mx is not None else mn
    return None


def _outlook_label(analysis: dict[str, Any] | None, goal: str) -> str:
    if not analysis:
        return ""
    if goal == "short_term":
        o = analysis.get("short_term_outlook_0_to_12_months")
        if isinstance(o, dict) and o.get("strategy"):
            return str(o["strategy"])[:80]
    elif goal == "mid_term":
        o = analysis.get("mid_term_outlook_1_to_3_years")
        if isinstance(o, dict) and o.get("strategy"):
            return str(o["strategy"])[:80]
    elif goal == "long_term":
        o = analysis.get("long_term_outlook_3_to_5_years")
        if isinstance(o, dict) and o.get("investment_theme"):
            return str(o["investment_theme"])[:80]
    return ""


def _outlook_text_for_llm(analysis: dict[str, Any] | None, goal: str) -> str:
    """Longer outlook summary for the LLM context."""
    if not analysis:
        return "No outlook data."
    parts = []
    if goal == "short_term":
        o = analysis.get("short_term_outlook_0_to_12_months")
        if isinstance(o, dict):
            parts.append(o.get("strategy") or "")
            parts.append(o.get("expected_price_range_change") or "")
            parts.append(f"Growth probability: {o.get('growth_probability', 'N/A')}")
    elif goal == "mid_term":
        o = analysis.get("mid_term_outlook_1_to_3_years")
        if isinstance(o, dict):
            parts.append(o.get("strategy") or "")
            parts.append(o.get("expected_annual_return") or "")
            parts.append(f"Growth: {o.get('growth_probability', 'N/A')}")
    elif goal == "long_term":
        o = analysis.get("long_term_outlook_3_to_5_years")
        if isinstance(o, dict):
            parts.append(o.get("investment_theme") or "")
            parts.append(o.get("expected_annual_return_best_case") or "")
            parts.append(o.get("long_term_risk") or "")
    fin = analysis.get("final_decision") if isinstance(analysis.get("final_decision"), dict) else None
    if fin and fin.get("summary_verdict"):
        parts.append(str(fin["summary_verdict"]))
    return " ".join(p for p in parts if p).strip() or "No outlook summary."


def _market_price(company: Company) -> float | None:
    """Market price NPR per share from company overview."""
    ov = company.overview if getattr(company, "overview", None) else ((company.raw_detail or {}).get("overview") if company.raw_detail else None)
    if not ov or not isinstance(ov, dict):
        return None
    v = ov.get("market_price")
    if v is None:
        return None
    try:
        p = float(v)
        return p if p > 0 else None
    except (TypeError, ValueError):
        return None


def _round_to_whole_shares(items: list[dict[str, Any]], company_by_symbol: dict[str, Company]) -> None:
    """In-place: set suggested_amount_npr to whole-share multiples (Nepal does not allow partial shares)."""
    for it in items:
        sym = it.get("symbol")
        c = company_by_symbol.get(sym) if sym else None
        if not c:
            continue
        price = _market_price(c)
        if not price or price <= 0:
            continue
        amt = int(it.get("suggested_amount_npr") or 0)
        shares = max(1, amt // int(price))
        it["suggested_amount_npr"] = int(shares * price)
    total = sum(it.get("suggested_amount_npr") or 0 for it in items)
    if total > 0:
        for it in items:
            pct = (it.get("suggested_amount_npr") or 0) / total * 100
            it["allocation_pct"] = round(pct, 1)


def _expected_overall_return_pct(items: list[dict[str, Any]]) -> float | None:
    """Weighted average expected return % by allocation_pct."""
    total = 0.0
    weight_used = 0.0
    for it in items:
        pct = it.get("allocation_pct") or 0
        ret = it.get("expected_return_pct")
        if ret is not None:
            total += (pct / 100.0) * ret
            weight_used += pct / 100.0
    if weight_used <= 0:
        return None
    return round(total / weight_used, 1)


def _get_suggestions_rule_based(
    companies: list[tuple[Company, float, str]],
    amount_npr: int,
    goal: str,
    max_stocks: int,
) -> list[dict[str, Any]]:
    """Rule-based allocation: equal split across top scored companies."""
    top = [t for t in companies if t[1] > 0][:max_stocks] or companies[:max_stocks]
    n = len(top)
    if n == 0:
        return []
    suggested_amount_per = round(amount_npr / n)
    allocation_pct = round(100.0 / n, 1)
    result = []
    for c, _, outlook in top:
        risk = get_risk_tier(c.analysis) or "moderate"
        rec = "consider" if get_entry_timing(c.analysis) == "now" else "watch"
        ret_pct = _expected_return_pct(c.analysis, goal)
        result.append({
            "symbol": c.symbol,
            "name": c.name or "",
            "sector": c.sector or "",
            "suggested_amount_npr": suggested_amount_per,
            "allocation_pct": allocation_pct,
            "recommendation": rec,
            "risk_tier": risk,
            "outlook_label": outlook,
            "expected_return_pct": round(ret_pct, 1) if ret_pct is not None else None,
        })
    return result


def get_suggestions(db: Session, amount_npr: int, goal: str, max_stocks: int = 8) -> list[dict[str, Any]]:
    """Return suggested stocks: consider/watch only. Uses AI (Gemini) when available, else rule-based allocation."""
    if amount_npr < 1000 or goal not in ("short_term", "mid_term", "long_term"):
        return []

    companies = db.query(Company).filter(Company.symbol.isnot(None)).order_by(Company.symbol).limit(500).all()
    scored: list[tuple[Company, float, str]] = []
    for c in companies:
        timing = get_entry_timing(c.analysis)
        if timing == "avoid" or not timing:
            continue
        score = _goal_score(c.analysis, goal)
        outlook = _outlook_label(c.analysis, goal)
        scored.append((c, score, outlook))

    scored.sort(key=lambda x: (-x[1], x[0].symbol))
    top_candidates = scored[: 25]
    if not top_candidates:
        return []

    try:
        from core.suggestion_llm import suggest_allocation_llm
    except ImportError:
        suggest_allocation_llm = None

    if suggest_allocation_llm:
        candidates_for_llm = []
        company_by_symbol = {c.symbol: c for c, _, _ in top_candidates}
        for c, _, _ in top_candidates:
            risk = get_risk_tier(c.analysis) or "moderate"
            rec = "consider" if get_entry_timing(c.analysis) == "now" else "watch"
            price = _market_price(c)
            candidates_for_llm.append({
                "symbol": c.symbol,
                "name": c.name or "",
                "sector": c.sector or "",
                "recommendation": rec,
                "risk_tier": risk,
                "outlook_text": _outlook_text_for_llm(c.analysis, goal),
                "market_price": price,
            })
        try:
            ai_suggestions = suggest_allocation_llm(amount_npr, goal, candidates_for_llm)
        except Exception as e:
            logger.warning("AI suggestion failed, using rule-based: %s", e)
            ai_suggestions = []
        if ai_suggestions:
            result = []
            for s in ai_suggestions:
                symbol = (s.get("symbol") or "").strip().upper()
                if not symbol or symbol not in company_by_symbol:
                    continue
                c = company_by_symbol[symbol]
                risk = get_risk_tier(c.analysis) or "moderate"
                rec = "consider" if get_entry_timing(c.analysis) == "now" else "watch"
                ret_pct = _expected_return_pct(c.analysis, goal)
                result.append({
                    "symbol": symbol,
                    "name": c.name or "",
                    "sector": c.sector or "",
                    "suggested_amount_npr": int(s.get("suggested_amount_npr") or 0),
                    "allocation_pct": float(s.get("allocation_pct") or 0),
                    "recommendation": rec,
                    "risk_tier": risk,
                    "outlook_label": (s.get("outlook_label") or "").strip() or _outlook_label(c.analysis, goal),
                    "expected_return_pct": round(ret_pct, 1) if ret_pct is not None else None,
                })
            if result:
                if len(result) > max_stocks:
                    result = result[:max_stocks]
                    n = len(result)
                    base = amount_npr // n
                    remainder = amount_npr % n
                    for i, r in enumerate(result):
                        r["suggested_amount_npr"] = base + (1 if i < remainder else 0)
                        r["allocation_pct"] = round(100.0 / n, 1)
                _round_to_whole_shares(result, company_by_symbol)
                overall = _expected_overall_return_pct(result)
                return result, overall

    items = _get_suggestions_rule_based(top_candidates, amount_npr, goal, max_stocks)
    company_by_symbol = {c.symbol: c for c, _, _ in top_candidates}
    _round_to_whole_shares(items, company_by_symbol)
    overall = _expected_overall_return_pct(items)
    return items, overall
