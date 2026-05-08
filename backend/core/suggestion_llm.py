"""AI-powered investment suggestion: allocate amount_npr across stocks by goal (short/mid/long term)."""

import json
import logging
import os
import random
import time
from typing import Any

try:
    import ollama
except ImportError:
    ollama = None

logger = logging.getLogger("SuggestionLLM")


def _env_int(key: str, default: int) -> int:
    v = os.getenv(key)
    if v is None:
        return default
    try:
        return int(v)
    except ValueError:
        return default


def _env_float(key: str, default: float) -> float:
    v = os.getenv(key)
    if v is None:
        return default
    try:
        return float(v)
    except ValueError:
        return default


SUGGESTION_MAX_RETRIES = _env_int("LLM_MAX_RETRIES", 5)
SUGGESTION_RETRY_DELAY = _env_float("LLM_RETRY_DELAY", 2.0)
SUGGESTION_RETRY_MAX_DELAY = _env_float("LLM_RETRY_MAX_DELAY", 60.0)

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
    "short_term": "Short term (0-12 months)",
    "mid_term": "Mid term (1-3 years)",
    "long_term": "Long term (3-5 years)",
}


def _build_company_summaries(candidates: list[dict[str, Any]], _goal: str) -> str:
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


def _retry_with_backoff(
    fn,
    *args,
    max_retries: int = SUGGESTION_MAX_RETRIES,
    base_delay: float = SUGGESTION_RETRY_DELAY,
    max_delay: float = SUGGESTION_RETRY_MAX_DELAY,
    **kwargs,
) -> Any:
    last_exception: Exception | None = None
    consecutive_rate_limits = 0

    for attempt in range(max_retries):
        try:
            return fn(*args, **kwargs)
        except json.JSONDecodeError as e:
            last_exception = e
            logger.warning("Suggestion LLM JSON parse failed (attempt %d/%d)", attempt + 1, max_retries)
        except Exception as e:
            last_exception = e
            msg = str(e).lower()

            if any(kw in msg for kw in ("rate limit", "429", "too many requests")):
                consecutive_rate_limits += 1
                delay = base_delay * (2 ** consecutive_rate_limits)
                delay = min(delay, max(max_delay, 120.0))
                logger.warning("Suggestion LLM rate limited (attempt %d/%d), waiting %.1fs", attempt + 1, max_retries, delay)
            elif any(kw in msg for kw in ("timeout", "timed out", "connection")):
                delay = base_delay * (2 ** attempt)
                delay = min(delay + random.uniform(0, base_delay), max_delay)
                logger.warning("Suggestion LLM connection/timeout (attempt %d/%d), retrying in %.1fs", attempt + 1, max_retries, delay)
            elif any(kw in msg for kw in ("server error", "500", "502", "503", "504")):
                delay = base_delay * (2 ** attempt)
                delay = min(delay + random.uniform(0, delay * 0.3), max_delay)
                logger.warning("Suggestion LLM server error (attempt %d/%d), retrying in %.1fs", attempt + 1, max_retries, delay)
            else:
                delay = base_delay * (2 ** attempt)
                delay = min(delay + random.uniform(0, delay * 0.5), max_delay)
                logger.warning("Suggestion LLM error (attempt %d/%d), retrying in %.1fs", attempt + 1, max_retries, delay)

        if attempt < max_retries - 1:
            time.sleep(delay)

    if last_exception:
        logger.error("Suggestion LLM failed after %d attempts: %s", max_retries, last_exception)
    return []


def suggest_allocation_llm(
    amount_npr: int,
    goal: str,
    candidates: list[dict[str, Any]],
    api_key: str | None = None,
    model: str | None = None,
    host: str | None = None,
) -> list[dict[str, Any]]:
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
    analysis_signals = "\n".join(c.get("analysis_signals", "") for c in candidates if c.get("analysis_signals"))

    prompt = f"""You are allocating Nepal NEPSE stocks for a real portfolio.

Goal: {goal_label}
Total budget: NPR {amount_npr:,}
Select 1-6 stocks from the candidates below.

Rules:
- Whole shares only: suggested_amount_npr = shares x market_price.
- Match stock characteristics to the goal horizon.
- short_term: prefer momentum, catalysts, attractive entry timing.
- mid_term: prefer balanced growth, manageable risk, reasonable valuation.
- long_term: prefer durable business quality, dividend reliability, compounding potential.
- Do NOT allocate to every stock. Select only the best fits.
- Get as close to the total amount as possible.
- If the best choice dominates, concentrate.

Return JSON:
{{"suggestions":[{{"symbol":"TICKER","suggested_amount_npr":5000,"allocation_pct":25.0,"outlook_label":"brief reason"}}]}}

Candidates:
{company_summaries}

Analysis signals:
{analysis_signals}"""

    client = ollama.Client(host=host_url)

    def _call_suggestion():
        response = client.chat(
            model=model_name,
            messages=[
                {
                    "role": "system",
                    "content": "Return only valid JSON. Select stocks based on goal fit, quality, and whole-share arithmetic.",
                },
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            format="json",
            stream=False,
            options={"temperature": 0},
        )
        message = response.get("message", {}) if isinstance(response, dict) else {}
        if isinstance(message, dict):
            text = message.get("content") or message.get("response") or ""
        else:
            text = getattr(response, "message", None) and getattr(response.message, "content", None) or getattr(response, "text", None) or ""
        text = str(text).strip()
        data = json.loads(text)
        suggestions = data.get("suggestions") if isinstance(data, dict) else None
        if not isinstance(suggestions, list):
            raise ValueError("Invalid: missing suggestions list")
        n = len(suggestions)
        total = sum(int(s.get("suggested_amount_npr") or 0) for s in suggestions)
        if n and total != amount_npr:
            base = amount_npr // n
            remainder = amount_npr % n
            for i, s in enumerate(suggestions):
                s["suggested_amount_npr"] = base + (1 if i < remainder else 0)
        return suggestions

    return _retry_with_backoff(_call_suggestion)
