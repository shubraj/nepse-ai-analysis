#!/usr/bin/env python3
"""Company analysis: numeric scores computed locally, LLM used only for text commentary."""

import json
import logging
import os
import random
import re
import time
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from openai import OpenAI

from screening_constants import compute_scores_from_raw

_ROOT_DIR = Path(__file__).resolve().parent.parent

LOG_DIR = _ROOT_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True, parents=True)

logger = logging.getLogger("CompanyExtractorLLM")
logger.setLevel(logging.INFO)
if not logger.handlers:
    fmt = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
    fh = RotatingFileHandler(LOG_DIR / "company_extractor_llm.log", maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8")
    fh.setFormatter(fmt)
    sh = logging.StreamHandler()
    sh.setFormatter(fmt)
    logger.addHandler(fh)
    logger.addHandler(sh)


def _env_int(key: str, default: int) -> int:
    v = os.getenv(key)
    try:
        return int(v) if v else default
    except ValueError:
        return default


def _env_float(key: str, default: float) -> float:
    v = os.getenv(key)
    try:
        return float(v) if v else default
    except ValueError:
        return default


MAX_RETRIES = _env_int("LLM_MAX_RETRIES", 5)
RETRY_DELAY_BASE = _env_float("LLM_RETRY_DELAY", 2.0)
RETRY_MAX_DELAY = _env_float("LLM_RETRY_MAX_DELAY", 60.0)

# ---------------------------------------------------------------------------
# Prompt — static system message + tiny dynamic user message
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are a NEPSE equity analyst. Given pre-computed investment scores and key financials \
for a Nepal-listed stock, write brief analyst commentary.

Return ONLY valid JSON — no markdown fences — with exactly these fields:
{
  "summary_verdict": "<1-2 sentence investment verdict for a retail investor>",
  "pe_interpretation": "<one sentence on P/E vs sector peers>",
  "pb_interpretation": "<one sentence on P/BV vs sector peers>",
  "primary_risks": ["<risk 1>", "<risk 2>", "<risk 3>"],
  "strategy_short": "<one sentence action for next 0-12 months>",
  "strategy_mid": "<one sentence approach for 1-3 years>",
  "investment_theme": "<one sentence long-term thesis>"
}

Be conservative and evidence-based. Use only the provided numbers."""


def _build_user_prompt(raw_detail: dict[str, Any], scores: dict[str, Any]) -> str:
    overview = raw_detail.get("overview") or {}
    about = raw_detail.get("about") or {}
    dividends = raw_detail.get("dividend_history") or []

    sym = (raw_detail.get("symbol") or "").upper()
    name = about.get("company_name") or raw_detail.get("company_display_name") or sym
    sector = scores.get("sector") or ""

    inv = scores.get("investment_snapshot") or {}
    val = scores.get("valuation_analysis") or {}
    fin = scores.get("final_decision") or {}

    pe = overview.get("p_e_ratio") or overview.get("pe_ratio") or "N/A"
    pbv = overview.get("pbv") or "N/A"
    eps = overview.get("eps") or "N/A"
    price = overview.get("market_price") or "N/A"
    w52 = overview.get("52_weeks_high_low") or "N/A"
    div_years = sum(1 for d in dividends[:5] if d.get("value") or d.get("fiscal_year"))

    lines = [
        f"Company: {sym} — {name}",
        f"Sector: {sector}",
        f"Price: {price} | 52-week: {w52}",
        f"P/E: {pe} | P/BV: {pbv} | EPS: {eps}",
        f"Valuation: {val.get('valuation_status')} | Quality: {inv.get('investment_quality_score_numeric')}/10 | Risk: {inv.get('risk_score_numeric')}/10",
        f"Return potential: {inv.get('return_potential_numeric')}/10 | Confidence: {fin.get('confidence_score_numeric')}/10",
        f"Dividends: {div_years} year(s) of history",
    ]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Retry helper
# ---------------------------------------------------------------------------

def _retry_with_backoff(fn, *args, max_retries=MAX_RETRIES, base_delay=RETRY_DELAY_BASE, max_delay=RETRY_MAX_DELAY, **kwargs) -> Any:
    last_exc: Exception | None = None
    rl_streak = 0
    for attempt in range(max_retries):
        try:
            return fn(*args, **kwargs)
        except json.JSONDecodeError as e:
            last_exc = e
            delay = base_delay * (2 ** attempt)
            logger.warning("LLM JSON parse failed (attempt %d/%d)", attempt + 1, max_retries)
        except Exception as e:
            last_exc = e
            msg = str(e).lower()
            if any(k in msg for k in ("rate limit", "429", "too many requests")):
                rl_streak += 1
                delay = min(base_delay * (2 ** rl_streak), max(max_delay, 120.0))
                logger.warning("LLM rate limited (attempt %d/%d), waiting %.1fs", attempt + 1, max_retries, delay)
            elif any(k in msg for k in ("timeout", "timed out", "connection")):
                delay = min(base_delay * (2 ** attempt) + random.uniform(0, base_delay), max_delay)
                logger.warning("LLM timeout (attempt %d/%d): %s", attempt + 1, max_retries, e)
            else:
                delay = min(base_delay * (2 ** attempt) + random.uniform(0, base_delay * 0.5), max_delay)
                logger.warning("LLM error (attempt %d/%d): %s", attempt + 1, max_retries, e)
        if attempt < max_retries - 1:
            time.sleep(delay)
    raise RuntimeError(f"LLM request failed after {max_retries} attempts: {last_exc}") from last_exc


# ---------------------------------------------------------------------------
# Main extractor
# ---------------------------------------------------------------------------

class CompanyExtractorLLM:
    def __init__(self, api_key: str | None = None, model: str | None = None, base_url: str | None = None):
        self.api_key = api_key or os.getenv("OPENROUTER_API_KEY")
        if not self.api_key:
            raise ValueError("OPENROUTER_API_KEY is required. Set it or pass api_key= to CompanyExtractorLLM().")
        self.base_url = base_url or os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
        self.model = model or os.getenv("OPENROUTER_MODEL", "google/gemini-flash-1.5")
        self.client = OpenAI(api_key=self.api_key, base_url=self.base_url)
        self._circuit_open = False
        self._circuit_until = 0.0
        self._circuit_failures = 0
        self._circuit_threshold = _env_int("LLM_CIRCUIT_BREAKER_FAILURES", 8)
        self._circuit_cooldown = _env_float("LLM_CIRCUIT_COOLDOWN", 30.0)

    def _check_circuit(self) -> None:
        if self._circuit_open:
            if time.time() > self._circuit_until:
                self._circuit_open = False
                self._circuit_failures = 0
                logger.info("Circuit breaker reset")
            else:
                remaining = int(self._circuit_until - time.time())
                raise RuntimeError(f"LLM circuit breaker open, retry in {remaining}s")

    def _record_failure(self) -> None:
        self._circuit_failures += 1
        if self._circuit_failures >= self._circuit_threshold:
            self._circuit_open = True
            self._circuit_until = time.time() + self._circuit_cooldown
            logger.warning("Circuit breaker opened after %d failures, cooldown %.0fs", self._circuit_failures, self._circuit_cooldown)

    def _record_success(self) -> None:
        self._circuit_failures = max(0, self._circuit_failures - 1)

    def _call_llm(self, user_prompt: str) -> dict[str, Any]:
        self._check_circuit()
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0,
        )
        text = (response.choices[0].message.content or "").strip()
        if text.startswith("```"):
            m = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL | re.IGNORECASE)
            if m:
                text = m.group(1).strip()
        if not text:
            raise ValueError("Empty response from LLM")
        data = json.loads(text)
        if not isinstance(data, dict):
            raise ValueError("Expected JSON object from LLM")
        return data

    def _get_text_fields(self, user_prompt: str) -> dict[str, Any]:
        try:
            result = _retry_with_backoff(self._call_llm, user_prompt)
            self._record_success()
            return result
        except Exception:
            self._record_failure()
            raise

    def _merge_text_into_scores(self, scores: dict[str, Any], text: dict[str, Any]) -> dict[str, Any]:
        """Patch LLM text fields into the locally-computed scores dict."""
        scores["market_position"] = _clean(text.get("market_position"))
        scores["investment_snapshot"]["suitability"] = _clean(text.get("suitability"))
        scores["valuation_analysis"]["pe_interpretation"] = _clean(text.get("pe_interpretation"))
        scores["valuation_analysis"]["pb_interpretation"] = _clean(text.get("pb_interpretation"))
        scores["risk_analysis"]["primary_risks"] = _clean_list(text.get("primary_risks"))
        scores["short_term_outlook_0_to_12_months"]["strategy"] = _clean(text.get("strategy_short"))
        scores["mid_term_outlook_1_to_3_years"]["strategy"] = _clean(text.get("strategy_mid"))
        scores["long_term_outlook_3_to_5_years"]["investment_theme"] = _clean(text.get("investment_theme"))
        scores["final_decision"]["summary_verdict"] = _clean(text.get("summary_verdict"))
        return scores

    def extract_from_raw_detail(self, raw_detail: dict[str, Any]) -> dict[str, Any]:
        symbol = (raw_detail.get("symbol") or "").upper()
        logger.info("Scoring %s", symbol)

        # Phase 1: local rules — free, instant
        scores = compute_scores_from_raw(raw_detail)

        # Phase 2: LLM for text commentary only (~400 tokens total)
        try:
            user_prompt = _build_user_prompt(raw_detail, scores)
            text = self._get_text_fields(user_prompt)
            scores = self._merge_text_into_scores(scores, text)
            logger.info("Text fields generated for %s", symbol)
        except Exception as e:
            logger.warning("LLM text generation failed for %s: %s — using scores only", symbol, e)

        return scores


# ---------------------------------------------------------------------------
# String helpers
# ---------------------------------------------------------------------------

def _clean(v: Any) -> str | None:
    if v is None:
        return None
    s = re.sub(r"\s+", " ", str(v)).strip()
    return s or None


def _clean_list(v: Any) -> list[str]:
    if not isinstance(v, list):
        return []
    return [s for s in (_clean(x) for x in v) if s]
