"""AI-powered investment suggestion: allocate amount_npr across stocks by goal (short/mid/long term)."""

import json
import logging
import os
import time
from typing import Any

try:
    from google import genai
except ImportError:
    genai = None

logger = logging.getLogger("SuggestionLLM")

_SUGGESTION_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "suggestions": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "symbol": {"type": "STRING"},
                    "suggested_amount_npr": {"type": "INTEGER"},
                    "allocation_pct": {"type": "NUMBER"},
                    "outlook_label": {"type": "STRING"},
                },
            },
        },
    },
}

GOAL_LABELS = {
    "short_term": "Short term (0–12 months)",
    "mid_term": "Mid term (1–3 years)",
    "long_term": "Long term (3–5 years)",
}


def _build_company_summaries(candidates: list[dict[str, Any]], _goal: str) -> str:
    """Build compact text summary."""
    lines = []
    for c in candidates:
        symbol = c.get("symbol", "")
        rec = c.get("recommendation", "")
        risk = c.get("risk_tier", "")
        growth = (c.get("growth_potential") or "").strip() or "N/A"
        price = c.get("market_price")
        price_str = f" @{price:.0f}" if price else ""
        lines.append(f"{symbol}{price_str}|{rec}|{risk}|{growth}")
    return "\n".join(lines)


def suggest_allocation_llm(
    amount_npr: int,
    goal: str,
    candidates: list[dict[str, Any]],
    api_key: str | None = None,
    model: str | None = None,
) -> list[dict[str, Any]]:
    """
    Call Gemini to suggest how to allocate amount_npr (NPR) across the given candidates
    for the given goal (short_term, mid_term, long_term). Returns list of
    { symbol, suggested_amount_npr, allocation_pct, outlook_label }.
    """
    if not genai:
        raise RuntimeError("google-genai is required for AI suggestions. Install: pip install google-genai")
    key = api_key or os.getenv("GEMINI_API_KEY")
    if not key:
        raise ValueError("GEMINI_API_KEY is required for AI suggestions")
    model_name = model or os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

    if not candidates or amount_npr < 1000:
        return []

    goal_label = GOAL_LABELS.get(goal, goal)
    company_summaries = _build_company_summaries(candidates, goal)
    symbol_list = ", ".join(c.get("symbol", "") for c in candidates)

    prompt = f"""NEPSE analyst. Allocate NPR {amount_npr:,} for {goal_label}.

Rules:
- Whole shares only (no fractional). suggested_amount_npr = shares × market_price
- Pick 1-6 stocks from: {symbol_list}
- Prefer higher growth potential
- Get close to total amount

Output JSON: {{"suggestions":[{{"symbol":"TICKER","suggested_amount_npr":5000,"allocation_pct":25.0,"outlook_label":"reason"}}]}}

Companies:
{company_summaries}"""

    client = genai.Client(api_key=key)
    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config={
                    "response_mime_type": "application/json",
                    "response_schema": _SUGGESTION_RESPONSE_SCHEMA,
                },
            )
            text = (response.text or "").strip()
            data = json.loads(text)
            suggestions = data.get("suggestions") if isinstance(data, dict) else None
            if not isinstance(suggestions, list):
                raise ValueError("Invalid response: missing or invalid suggestions list")
            n = len(suggestions)
            total = sum(int(s.get("suggested_amount_npr") or 0) for s in suggestions)
            if n and total != amount_npr:
                base = amount_npr // n
                remainder = amount_npr % n
                for i, s in enumerate(suggestions):
                    s["suggested_amount_npr"] = base + (1 if i < remainder else 0)
            return suggestions
        except json.JSONDecodeError as e:
            logger.warning("Suggestion LLM JSON parse attempt %s: %s", attempt + 1, e)
            time.sleep(1.0 * (attempt + 1))
            continue
        except Exception as e:
            logger.warning("Suggestion LLM attempt %s: %s", attempt + 1, e)
            time.sleep(1.0 * (attempt + 1))
            continue
    return []
