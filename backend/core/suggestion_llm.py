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


def _build_company_summaries(candidates: list[dict[str, Any]], goal: str) -> str:
    """Build a compact text summary of each company for the chosen goal. Include market_price (NPR per share) for whole-share constraint."""
    lines = []
    for c in candidates:
        symbol = c.get("symbol", "")
        name = c.get("name", "")
        sector = c.get("sector", "")
        recommendation = c.get("recommendation", "")
        risk_tier = c.get("risk_tier", "")
        outlook = (c.get("outlook_text") or "").strip() or "No outlook summary."
        price = c.get("market_price")
        price_str = f" | Market price: NPR {price:.0f} per share" if price is not None and price > 0 else ""
        lines.append(f"- {symbol} | {name} | Sector: {sector} | Recommendation: {recommendation} | Risk: {risk_tier}{price_str}\n  Outlook: {outlook}")
    return "\n\n".join(lines)


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

    prompt = f"""You are a senior financial analyst for the Nepal stock market (NEPSE). A user wants to invest a fixed amount in NPR and needs your allocation suggestion.

## Important: whole shares only
Nepal does not allow partial or fractional share buying. Each suggested_amount_npr MUST equal (whole number of shares × market price per share). Use the "Market price: NPR X per share" shown for each company: suggested_amount_npr must be a multiple of that price (e.g. if price is 500, suggest 2500, 5000, 10000 — never 3333). Minimum 1 share per stock.

## User input
- Amount to invest: NPR {amount_npr:,}
- Investment goal: {goal_label}

## Eligible companies (only suggest from this list)
The following companies have been pre-screened as Consider or Watch (not Avoid). Use only these symbols: {symbol_list}.

## Company summaries (analysis for the user's goal; market price in NPR per share)
{company_summaries}

## Your task
1. Select between 1 and 6 stocks from the list above that best fit the user's goal ({goal_label}) and amount.
2. For each stock, suggested_amount_npr MUST be (whole shares × market price). Only multiples of market_price; no fractional shares.
3. Get as close as possible to total NPR {amount_npr:,} while respecting whole-share amounts (total may be slightly under).
4. allocation_pct is the percentage of the total suggested amount for that stock (e.g. 25.0 for 25%).
5. For each stock write a brief outlook_label: one short sentence explaining why it fits this goal (max 100 characters).

Return a JSON object with a single key "suggestions" containing an array of objects, each with:
- symbol (string): ticker symbol
- suggested_amount_npr (integer): amount in NPR (must be whole shares × market_price for that symbol)
- allocation_pct (number): percentage of total (e.g. 12.5)
- outlook_label (string): brief reason for this suggestion

Return valid JSON only. No markdown or extra text."""

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
