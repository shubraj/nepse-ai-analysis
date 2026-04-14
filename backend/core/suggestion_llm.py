"""AI-powered investment suggestion: allocate amount_npr across stocks by goal (short/mid/long term)."""

import json
import logging
import os
import time
from typing import Any

try:
    import ollama
except ImportError:
    ollama = None

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
        sector = (c.get("sector") or "").strip() or "N/A"
        outlook = (c.get("outlook_text") or "").strip() or "N/A"
        signals = (c.get("analysis_signals") or "").strip() or "N/A"
        lines.append(f"{symbol}{price_str}|sector={sector}|rec={rec}|risk={risk}|growth={growth}|outlook={outlook}|signals={signals}")
    return "\n".join(lines)


def suggest_allocation_llm(
    amount_npr: int,
    goal: str,
    candidates: list[dict[str, Any]],
    api_key: str | None = None,
    model: str | None = None,
    host: str | None = None,
) -> list[dict[str, Any]]:
    """
    Call Ollama to suggest how to allocate amount_npr (NPR) across the given candidates
    for the given goal (short_term, mid_term, long_term). Returns list of
    { symbol, suggested_amount_npr, allocation_pct, outlook_label }.
    """
    if not ollama:
        raise RuntimeError("ollama is required for AI suggestions. Install: pip install ollama")
    key = api_key or os.getenv("OLLAMA_API_KEY")
    if not key:
        raise ValueError("OLLAMA_API_KEY is required for AI suggestions")
    model_name = model or os.getenv("OLLAMA_MODEL", "kimi-k2.5:cloud")
    host_url = host or os.getenv("OLLAMA_HOST", "https://ollama.com")

    if not candidates or amount_npr < 1000:
        return []

    goal_label = GOAL_LABELS.get(goal, goal)
    company_summaries = _build_company_summaries(candidates, goal)
    symbol_list = ", ".join(c.get("symbol", "") for c in candidates)
    analysis_signals = "\n".join(c.get("analysis_signals", "") for c in candidates if c.get("analysis_signals"))

    prompt = f"""You are allocating Nepal stocks for a real portfolio, not writing marketing copy.

Goal: {goal_label}
Allocate NPR {amount_npr:,} across 1-6 stocks from the candidate list below.

Rules:
- Whole shares only. suggested_amount_npr must equal shares x market_price.
- Prefer stocks whose analysis aligns with the goal horizon.
- Use risk_tier, recommendation, valuation, dividend quality, and outlook numbers together.
- For short term, prefer stronger catalyst / momentum / entry timing.
- For mid term, prefer balanced growth and manageable risk.
- For long term, prefer durable business quality, dividend reliability, and compounding potential.
- Do not allocate to every stock just because it appears in the list.
- Return only the best 1-6 stocks and get as close as possible to the total amount.
- If the best choice is concentrated, use fewer stocks.

Output JSON: {{"suggestions":[{{"symbol":"TICKER","suggested_amount_npr":5000,"allocation_pct":25.0,"outlook_label":"reason"}}]}}

Companies:
{company_summaries}

Analysis signals:
{analysis_signals}"""

    client = ollama.Client(host=host_url)
    for attempt in range(3):
        try:
            response = client.chat(
                model=model_name,
                messages=[
                    {
                        'role': 'system',
                        'content': 'Return only valid JSON. Focus on stock allocation quality, goal fit, and whole-share arithmetic.',
                    },
                    {
                        'role': 'user',
                        'content': prompt,
                    }
                ],
                format='json',
                stream=False,
                options={"temperature": 0},
            )
            message = response.get('message', {}) if isinstance(response, dict) else {}
            if isinstance(message, dict):
                text = message.get('content') or message.get('response') or ""
            else:
                text = getattr(response, 'message', None) and getattr(response.message, 'content', None) or getattr(response, 'text', None) or ""
            text = str(text).strip()
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
