#!/usr/bin/env python3
"""Company data extractor via OpenRouter; output follows format.json."""

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

from screening_constants import final_decision_from_numerics

_ROOT_DIR = Path(__file__).resolve().parent.parent
_FORMAT_JSON_PATH = _ROOT_DIR / "format.json"


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


MAX_RETRIES = _env_int("LLM_MAX_RETRIES", 5)
RETRY_DELAY_BASE = _env_float("LLM_RETRY_DELAY", 2.0)
RETRY_MAX_DELAY = _env_float("LLM_RETRY_MAX_DELAY", 60.0)
REQUEST_TIMEOUT = _env_float("LLM_REQUEST_TIMEOUT", 120.0)

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


def _retry_with_backoff(
    fn,
    *args,
    max_retries: int = MAX_RETRIES,
    base_delay: float = RETRY_DELAY_BASE,
    max_delay: float = RETRY_MAX_DELAY,
    timeout: float = REQUEST_TIMEOUT,
    **kwargs,
) -> Any:
    """Call fn with exponential backoff + jitter. Handles rate limits, timeouts, and transient failures."""
    last_exception: Exception | None = None
    consecutive_rate_limits = 0

    for attempt in range(max_retries):
        try:
            return fn(*args, **kwargs)
        except json.JSONDecodeError as e:
            last_exception = e
            logger.warning("LLM JSON parse failed (attempt %d/%d): %s", attempt + 1, max_retries, e)
        except Exception as e:
            last_exception = e
            msg = str(e).lower()

            if any(kw in msg for kw in ("rate limit", "429", "too many requests")):
                consecutive_rate_limits += 1
                delay = base_delay * (2 ** consecutive_rate_limits)
                delay = min(delay, max(max_delay, 120.0))
                logger.warning("LLM rate limited (attempt %d/%d), waiting %.1fs", attempt + 1, max_retries, delay)
            elif any(kw in msg for kw in ("timeout", "timed out", "connection")):
                delay = base_delay * (2 ** attempt)
                delay = min(delay + random.uniform(0, base_delay), max_delay)
                logger.warning("LLM connection/timeout (attempt %d/%d): %s, retrying in %.1fs", attempt + 1, max_retries, e, delay)
            elif any(kw in msg for kw in ("server error", "500", "502", "503", "504")):
                delay = base_delay * (2 ** attempt)
                delay = min(delay + random.uniform(0, delay * 0.3), max_delay)
                logger.warning("LLM server error (attempt %d/%d): %s, retrying in %.1fs", attempt + 1, max_retries, e, delay)
            else:
                delay = base_delay * (2 ** attempt)
                delay = min(delay + random.uniform(0, delay * 0.5), max_delay)
                logger.warning("LLM error (attempt %d/%d): %s, retrying in %.1fs", attempt + 1, max_retries, e, delay)

        if attempt < max_retries - 1:
            time.sleep(delay)

    if last_exception:
        raise RuntimeError(f"LLM request failed after {max_retries} attempts: {last_exception}") from last_exception
    raise RuntimeError("Unreachable")


_EXTRACTION_PROMPT = """You are a NEPSE equity analyst generating one structured JSON record for a listed Nepal company.

Use ONLY the provided context. Do not invent ratios, future events, or company facts. If a field cannot be supported by the context, use null or an empty list.

## Nepal Market Reference Ranges (use for calibration):

### Banking Sector (Commercial / Development):
- P/E 15-30 is typical; below 15 = potentially undervalued, above 30 = expensive
- P/BV 0.8-2.5 typical; below 1 = discounted, above 3 = expensive
- Good banks have consistent dividends (>=15% bonus/cash dividend history)
- Risk: high NPLs, regulatory changes, interest rate volatility

### Insurance Sector:
- P/E 20-35 typical; rapid premium growth justifies higher multiples
- Low dividend consistency is normal for growing insurers
- Risk: underwriting losses, catastrophic events, regulatory

### Hydropower Sector:
- P/E 10-20 typical for operational plants; under-construction may have no P/E
- P/BV 0.5-1.5 typical
- Dividend may be irregular due to seasonal revenue
- Risk: hydrology risk, PPA terms, construction delays

### Finance / Microfinance:
- P/E 10-25 typical; P/BV 1-3 typical
- Higher credit risk than commercial banks
- Risk: NPL spikes, liquidity crunches, regulation on spreads

### Manufacturing / Trading / Others:
- Wide P/E ranges (8-30+), heavily dependent on industry-specific cycles
- Score conservatively when data is sparse

## Scoring Rubric (1-10 scale):

investment_quality_score_numeric:
- 9-10: Market leader, consistent earnings, strong dividends, attractive valuation
- 7-8: Strong fundamentals, one or two minor weaknesses
- 5-6: Average for sector, mixed signals
- 3-4: Below-average fundamentals, multiple concerns
- 1-2: Poor quality, speculative, inconsistent performance

risk_score_numeric (higher = riskier):
- 1-3: Very stable, low debt, sector leader, consistent history
- 4-6: Sector-average risk, normal business cycle exposure
- 7-8: Above-average risk, volatile earnings, competitive pressure
- 9-10: Highly speculative, distressed, regulatory trouble

return_potential_numeric:
- Derive from valuation gap + dividend yield + sector growth
- Undervalued + strong sector = 7-9; Fairly valued + moderate growth = 4-6; Overvalued = 1-3

confidence_score_numeric:
- 8-10: Rich data, clear trends, multiple years of history
- 5-7: Adequate data with some gaps or mixed signals
- 1-4: Sparse data, contradictory signals

## Cross-field consistency rules:

1. dividend_consistency_score <= 3 -> suitable_for_income_investors MUST be false
2. risk_score >= 7 -> recommendation should be Avoid
3. valuation_status = Undervalued AND quality >= 6 -> return_potential >= 6
4. valuation_status = Overvalued -> return_potential <= 4
5. No dividend history -> dividend_consistency = 1, income_reliability = 1
6. Bank with P/E > 35 should NOT be Undervalued without exceptional growth
7. entry_timing = Now only if quality >= 5 AND risk <= 6 AND valuation at least Fair
8. High dividend consistency should mean lower volatility

## Required JSON output:

Return ONLY a JSON object with these top-level fields (use null for missing fields):

ticker_symbol, company_name, sector, market_position (all strings)

investment_snapshot (object): investment_quality_score(text), investment_quality_score_numeric(1-10), risk_level(text), risk_score_numeric(1-10), return_potential(text), return_potential_numeric(1-10), suitability(text)

valuation_analysis (object): valuation_status(Undervalued/Fairly Valued/Overvalued), valuation_score_numeric(-1/0/1), pe_interpretation(text), pb_interpretation(text), value_or_growth_style(Value/Growth/Blend)

short_term_outlook_0_to_12_months (object): growth_probability(text), growth_probability_numeric(1-5), expected_price_range_change(text), expected_return_low_pct(number), expected_return_high_pct(number), key_triggers(list of strings), strategy(text)

mid_term_outlook_1_to_3_years (object): growth_probability(text), growth_probability_numeric(1-5), expected_annual_return(text), expected_annual_return_min_pct(number), expected_annual_return_max_pct(number), key_drivers(list of strings), strategy(text)

long_term_outlook_3_to_5_years (object): growth_probability(text), growth_probability_numeric(1-5), expected_annual_return_best_case(text), expected_annual_return_best_case_min_pct(number), expected_annual_return_best_case_max_pct(number), investment_theme(text), long_term_risk(text), long_term_risk_score_numeric(1-10)

dividend_profile (object): dividend_consistency(text), dividend_consistency_score_numeric(1-10), income_reliability(text), income_reliability_score_numeric(1-10), suitable_for_income_investors(boolean)

financial_strength_monitoring (object): eps_trend(text), capital_strength(text), asset_quality(text), liquidity_position(text)

risk_analysis (object): primary_risks(list of strings), volatility_level(text), volatility_score_numeric(1-10)

portfolio_strategy_recommendation (object): allocation_size(text), allocation_max_pct_numeric(0-100), holding_period(text), holding_period_years_numeric(0-20), buy_strategy(text)

who_should_invest (list of strings), who_should_avoid (list of strings)

final_decision (object): invest_now(Yes/Conditional/No), invest_score_numeric(0/0.5/1), wait_option(text), confidence_level(text), confidence_score_numeric(1-10), risk_tier(Low/Moderate/High), investability_label(High/Moderate/Low), entry_timing(Now/Wait/Avoid), recommendation(Consider/Watch/Avoid), summary_verdict(text)

Decision rule:
- High quality + attractive valuation + manageable risk -> Consider/Now
- Average quality or unclear data -> Watch/Wait
- Poor quality, high risk, or clearly overvalued -> Avoid/Avoid
- When data is thin, lean toward Watch and lower confidence

Context:
{financial_context}"""


def _json_type_to_schema(val: Any) -> dict[str, Any]:
    if val is None:
        return {"type": "STRING", "nullable": True}
    if isinstance(val, bool):
        return {"type": "BOOLEAN"}
    if isinstance(val, int):
        return {"type": "INTEGER", "nullable": True}
    if isinstance(val, float):
        return {"type": "NUMBER", "nullable": True}
    if isinstance(val, str):
        return {"type": "STRING", "nullable": True}
    if isinstance(val, list):
        item = val[0] if val else None
        item_schema = _json_type_to_schema(item) if item is not None else {"type": "STRING", "nullable": True}
        return {"type": "ARRAY", "items": item_schema}
    if isinstance(val, dict):
        props = {k: _json_type_to_schema(v) for k, v in val.items()}
        return {"type": "OBJECT", "properties": props}
    return {"type": "STRING", "nullable": True}


def build_schema_from_format(format_dict: dict[str, Any]) -> dict[str, Any]:
    properties = {}
    for key, val in format_dict.items():
        key_clean = key.strip()
        if not key_clean:
            continue
        properties[key_clean] = _json_type_to_schema(val)
    return {"type": "OBJECT", "properties": properties}


class CompanyExtractorLLM:
    def __init__(self, api_key: str | None = None, model: str | None = None, base_url: str | None = None):
        self.api_key = api_key or os.getenv("OPENROUTER_API_KEY")
        if not self.api_key:
            raise ValueError(
                "OpenRouter API key required. Set OPENROUTER_API_KEY or pass api_key= to CompanyExtractorLLM(api_key=...)"
            )
        self.base_url = base_url or os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
        self.model = model or os.getenv("OPENROUTER_MODEL", "google/gemini-flash-1.5")
        self.client = OpenAI(api_key=self.api_key, base_url=self.base_url)
        self._format_dict = self._load_format()
        self.response_schema = build_schema_from_format(self._format_dict)
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
            logger.warning("Circuit breaker opened after %d consecutive failures. Cooling down for %.0fs", self._circuit_failures, self._circuit_cooldown)

    def _record_success(self) -> None:
        if self._circuit_failures > 0:
            self._circuit_failures = max(0, self._circuit_failures - 1)

    def _load_format(self) -> dict[str, Any]:
        if not _FORMAT_JSON_PATH.exists():
            raise FileNotFoundError(f"Format schema not found: {_FORMAT_JSON_PATH}")
        with open(_FORMAT_JSON_PATH, encoding="utf-8") as f:
            return json.load(f)

    def _extract_response_text(self, response: Any) -> str:
        return (response.choices[0].message.content or "").strip()

    def _load_json_from_text(self, text: str) -> dict[str, Any]:
        cleaned = text.strip()
        if not cleaned:
            raise ValueError("Empty response from OpenRouter")

        if cleaned.startswith("```"):
            match = re.search(r"```(?:json)?\s*(.*?)\s*```", cleaned, re.DOTALL | re.IGNORECASE)
            if match:
                cleaned = match.group(1).strip()

        if not cleaned.startswith(("{", "[")):
            match = re.search(r"(\{.*\}|\[.*\])", cleaned, re.DOTALL)
            if match:
                cleaned = match.group(1).strip()

        data = json.loads(cleaned)
        if not isinstance(data, dict):
            raise ValueError("Expected a JSON object from OpenRouter")
        return data

    def _call_openrouter(self, prompt: str) -> dict[str, Any]:
        self._check_circuit()
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "system",
                    "content": "Return only valid JSON. Do not include markdown, commentary, or code fences. Be conservative and evidence-based.",
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            temperature=0,
        )
        text = self._extract_response_text(response)
        if not text:
            raise ValueError("Empty response from OpenRouter")
        return self._load_json_from_text(text)

    def _query_model(self, prompt: str) -> dict[str, Any]:
        try:
            result = _retry_with_backoff(self._call_openrouter, prompt)
            self._record_success()
            return result
        except Exception:
            self._record_failure()
            raise

    def _build_financial_context(self, raw_detail: dict[str, Any]) -> dict[str, Any]:
        about = raw_detail.get("about") or {}
        overview = raw_detail.get("overview") or {}
        dividends = raw_detail.get("dividend_history") or []
        bonus = raw_detail.get("bonus_history") or []
        right = raw_detail.get("right_share_history") or []
        symbol = (raw_detail.get("symbol") or "").upper()

        def _num(s: Any) -> float | None:
            if s is None:
                return None
            if isinstance(s, (int, float)):
                return float(s)
            s = str(s).strip()
            m = re.search(r"-?\d+\.?\d*", s)
            if m:
                try:
                    return float(m.group(0))
                except ValueError:
                    pass
            return None

        pe = _num(overview.get("p_e_ratio") or overview.get("pe_ratio"))
        pbv = _num(overview.get("pbv"))
        sector = (about.get("sector") or overview.get("sector") or "").lower()

        dividend_values = []
        for d in dividends[:5]:
            v = d.get("value") or ""
            fy = d.get("fiscal_year") or ""
            if v or fy:
                dividend_values.append({"v": v, "fy": fy})
        last_dividend = dividend_values[0] if dividend_values else None

        has_dividend_history = len(dividend_values) > 0
        dividend_years = len(dividend_values)

        bonus_values = []
        for b_item in bonus[:5]:
            v = b_item.get("value") or ""
            fy = b_item.get("fiscal_year") or ""
            if v or fy:
                bonus_values.append({"v": v, "fy": fy})

        right_values = []
        for r_item in right[:5]:
            v = r_item.get("value") or ""
            fy = r_item.get("fiscal_year") or ""
            if v or fy:
                right_values.append({"v": v, "fy": fy})

        sector_type = "other"
        if any(kw in sector for kw in ("bank", "commercial")):
            sector_type = "banking"
        elif any(kw in sector for kw in ("insurance",)):
            sector_type = "insurance"
        elif any(kw in sector for kw in ("hydro", "power", "energy")):
            sector_type = "hydropower"
        elif any(kw in sector for kw in ("finance", "microfinance", "micro-finance", "laghubitta")):
            sector_type = "finance"

        return {
            "sym": symbol,
            "name": about.get("company_name") or raw_detail.get("company_display_name") or "",
            "sector": about.get("sector") or overview.get("sector") or "",
            "sector_type": sector_type,
            "mkt": {
                "price": _num(overview.get("market_price")),
                "change": overview.get("pct_change") or "",
                "52w": overview.get("52_weeks_high_low") or "",
                "cap": overview.get("market_capitalization") or "",
                "yield": overview.get("1_year_yield") or "",
                "avg_volume": overview.get("30_day_avg_volume") or "",
            },
            "val": {
                "eps": _num(overview.get("eps")),
                "pe": pe,
                "bv": _num(overview.get("book_value")),
                "pbv": pbv,
            },
            "div": dividend_values,
            "div_last": last_dividend,
            "div_has_history": has_dividend_history,
            "div_years": dividend_years,
            "bonus": bonus_values,
            "right": right_values,
        }

    def extract_from_raw_detail(self, raw_detail: dict[str, Any]) -> dict[str, Any]:
        financial_context = self._build_financial_context(raw_detail)
        context_str = json.dumps(financial_context, indent=2, default=str)
        prompt = _EXTRACTION_PROMPT.format(financial_context=context_str)

        symbol = (raw_detail.get("symbol") or "").upper()

        try:
            logger.info("Extracting analysis for %s", symbol)
            data = self._query_model(prompt)
            logger.info("Successfully extracted analysis for %s", symbol)
            result = self._validate_and_clean(data, raw_detail)
            result = self._post_process_consistency(result, financial_context)
            return result
        except Exception as e:
            logger.error("OpenRouter extraction failed for %s: %s", symbol, e)
            return self._fallback_from_raw(raw_detail)

    def _post_process_consistency(self, data: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any]:
        """Enforce cross-field consistency rules after AI output."""
        inv = data.get("investment_snapshot") or {}
        div = data.get("dividend_profile") or {}
        risk = data.get("risk_analysis") or {}
        val = data.get("valuation_analysis") or {}

        quality_n = inv.get("investment_quality_score_numeric")
        risk_n = inv.get("risk_score_numeric")
        return_n = inv.get("return_potential_numeric")
        val_n = val.get("valuation_score_numeric")
        div_consistency_n = div.get("dividend_consistency_score_numeric")
        income_n = div.get("income_reliability_score_numeric")
        volatility_n = risk.get("volatility_score_numeric")

        if not ctx.get("div_has_history"):
            if isinstance(div, dict):
                div["dividend_consistency_score_numeric"] = 1
                div["income_reliability_score_numeric"] = 1
                div["suitable_for_income_investors"] = False

        if isinstance(div_consistency_n, (int, float)) and div_consistency_n <= 3:
            if isinstance(div, dict):
                div["suitable_for_income_investors"] = False

        if isinstance(risk_n, (int, float)) and risk_n >= 7:
            if isinstance(data.get("final_decision"), dict):
                data["final_decision"]["recommendation"] = "Avoid"

        if val_n == 1 and isinstance(quality_n, (int, float)) and quality_n >= 6:
            if isinstance(return_n, (int, float)) and return_n < 6:
                inv["return_potential_numeric"] = 6

        if val_n == -1:
            if isinstance(return_n, (int, float)) and return_n > 4:
                inv["return_potential_numeric"] = 4

        if isinstance(volatility_n, (int, float)) and isinstance(div_consistency_n, (int, float)):
            if div_consistency_n >= 7 and volatility_n > 5:
                risk["volatility_score_numeric"] = max(1, min(10, volatility_n - 2))

        return data

    def _validate_and_clean(self, data: dict[str, Any], raw_detail: dict[str, Any]) -> dict[str, Any]:
        out = {}
        symbol = (raw_detail.get("symbol") or "").upper().strip()
        about = raw_detail.get("about") or {}
        overview = raw_detail.get("overview") or {}
        out["ticker_symbol"] = self._clean_ticker(data.get("ticker_symbol") or symbol)
        out["company_name"] = self._clean_string(data.get("company_name") or about.get("company_name") or "")
        out["sector"] = self._clean_string(data.get("sector") or about.get("sector") or overview.get("sector") or "")
        out["market_position"] = self._clean_string(data.get("market_position"))
        inv = data.get("investment_snapshot") or {}
        out["investment_snapshot"] = self._clean_object(
            inv,
            {"investment_quality_score", "risk_level", "return_potential", "suitability"},
        )
        out["investment_snapshot"]["investment_quality_score_numeric"] = self._clean_number(inv.get("investment_quality_score_numeric"), 1, 10)
        out["investment_snapshot"]["risk_score_numeric"] = self._clean_number(inv.get("risk_score_numeric"), 1, 10)
        out["investment_snapshot"]["return_potential_numeric"] = self._clean_number(inv.get("return_potential_numeric"), 1, 10)

        val = data.get("valuation_analysis") or {}
        out["valuation_analysis"] = self._clean_object(
            val,
            {"valuation_status", "pe_interpretation", "pb_interpretation", "value_or_growth_style"},
        )
        out["valuation_analysis"]["valuation_score_numeric"] = self._clean_number(val.get("valuation_score_numeric"), -1, 1)

        out["short_term_outlook_0_to_12_months"] = self._clean_outlook(data.get("short_term_outlook_0_to_12_months"))
        self._merge_short_term_numerics(out["short_term_outlook_0_to_12_months"], data.get("short_term_outlook_0_to_12_months"))

        out["mid_term_outlook_1_to_3_years"] = self._clean_outlook(data.get("mid_term_outlook_1_to_3_years"))
        self._merge_mid_term_numerics(out["mid_term_outlook_1_to_3_years"], data.get("mid_term_outlook_1_to_3_years"))

        out["long_term_outlook_3_to_5_years"] = self._clean_long_outlook(data.get("long_term_outlook_3_to_5_years"))
        self._merge_long_term_numerics(out["long_term_outlook_3_to_5_years"], data.get("long_term_outlook_3_to_5_years"))

        out["dividend_profile"] = self._clean_dividend_profile(data.get("dividend_profile"))
        div = data.get("dividend_profile") or {}
        out["dividend_profile"]["dividend_consistency_score_numeric"] = self._clean_number(div.get("dividend_consistency_score_numeric"), 1, 10)
        out["dividend_profile"]["income_reliability_score_numeric"] = self._clean_number(div.get("income_reliability_score_numeric"), 1, 10)

        out["financial_strength_monitoring"] = self._clean_object(
            data.get("financial_strength_monitoring"),
            {"eps_trend", "capital_strength", "asset_quality", "liquidity_position"},
        )
        out["risk_analysis"] = self._clean_risk_analysis(data.get("risk_analysis"))
        out["risk_analysis"]["volatility_score_numeric"] = self._clean_number((data.get("risk_analysis") or {}).get("volatility_score_numeric"), 1, 10)

        out["portfolio_strategy_recommendation"] = self._clean_object(
            data.get("portfolio_strategy_recommendation"),
            {"allocation_size", "holding_period", "buy_strategy"},
        )
        port = data.get("portfolio_strategy_recommendation") or {}
        out["portfolio_strategy_recommendation"]["allocation_max_pct_numeric"] = self._clean_number(port.get("allocation_max_pct_numeric"), 0, 100)
        out["portfolio_strategy_recommendation"]["holding_period_years_numeric"] = self._clean_number(port.get("holding_period_years_numeric"), 0, 20)

        out["who_should_invest"] = self._clean_string_list(data.get("who_should_invest"))
        out["who_should_avoid"] = self._clean_string_list(data.get("who_should_avoid"))
        fin = data.get("final_decision") or {}
        out["final_decision"] = self._clean_object(
            fin,
            {"invest_now", "wait_option", "confidence_level", "risk_tier", "investability_label", "entry_timing", "summary_verdict", "recommendation"},
        )
        out["final_decision"]["invest_score_numeric"] = self._clean_number(fin.get("invest_score_numeric"), 0, 1)
        out["final_decision"]["confidence_score_numeric"] = self._clean_number(fin.get("confidence_score_numeric"), 1, 10)
        for key in ("risk_tier", "investability_label", "entry_timing"):
            if out["final_decision"].get(key):
                v = str(out["final_decision"][key]).strip()
                if key == "entry_timing":
                    out["final_decision"][key] = v if v in ("Now", "Wait", "Avoid") else None
                else:
                    out["final_decision"][key] = v if v in ("Low", "Moderate", "High") else None
        if out["final_decision"].get("recommendation"):
            v = str(out["final_decision"]["recommendation"]).strip()
            out["final_decision"]["recommendation"] = v if v in ("Consider", "Watch", "Avoid") else None
        out["final_decision"]["summary_verdict"] = self._clean_string(fin.get("summary_verdict"))
        self._enforce_final_decision_consistency(out)
        return out

    def _enforce_final_decision_consistency(self, out: dict[str, Any]) -> None:
        computed = final_decision_from_numerics(out)
        fd = out.get("final_decision") or {}
        for key, value in computed.items():
            if value is not None:
                fd[key] = value
        out["final_decision"] = fd

    def _clean_ticker(self, v: Any) -> str:
        if v is None:
            return ""
        s = str(v).strip().upper()
        s = re.sub(r"[^A-Z0-9]", "", s)
        return s[:20] or ""

    def _clean_string(self, v: Any) -> str | None:
        if v is None:
            return None
        s = str(v).strip()
        s = re.sub(r"\s+", " ", s)
        return s if s else None

    def _clean_number(self, v: Any, low: float | None = None, high: float | None = None) -> int | float | None:
        if v is None:
            return None
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            n = float(v) if isinstance(v, float) else int(v)
        else:
            s = str(v).strip()
            m = re.search(r"-?\d+\.?\d*", s)
            if not m:
                return None
            try:
                n = float(m.group(0))
            except ValueError:
                return None
        if low is not None and n < low:
            n = low
        if high is not None and n > high:
            n = high
        return int(n) if isinstance(n, float) and n == int(n) else n

    def _clean_object(self, obj: Any, keys: set[str]) -> dict[str, Any]:
        if not isinstance(obj, dict):
            return {k: None for k in keys}
        return {k: self._clean_string(obj.get(k)) for k in keys}

    def _clean_string_list(self, v: Any) -> list[str]:
        if not isinstance(v, list):
            return []
        return [x for x in (self._clean_string(i) for i in v) if x]

    def _clean_outlook(self, v: Any) -> dict[str, Any]:
        if not isinstance(v, dict):
            return {}
        out = {}
        for key in ("growth_probability", "expected_price_range_change", "expected_annual_return", "strategy"):
            out[key] = self._clean_string(v.get(key))
        out["key_triggers"] = self._clean_string_list(v.get("key_triggers"))
        out["key_drivers"] = self._clean_string_list(v.get("key_drivers"))
        return out

    def _merge_short_term_numerics(self, out: dict[str, Any], raw: Any) -> None:
        if not isinstance(raw, dict):
            return
        out["growth_probability_numeric"] = self._clean_number(raw.get("growth_probability_numeric"), 1, 5)
        out["expected_return_low_pct"] = self._clean_number(raw.get("expected_return_low_pct"), -100, 100)
        out["expected_return_high_pct"] = self._clean_number(raw.get("expected_return_high_pct"), -100, 100)

    def _merge_mid_term_numerics(self, out: dict[str, Any], raw: Any) -> None:
        if not isinstance(raw, dict):
            return
        out["growth_probability_numeric"] = self._clean_number(raw.get("growth_probability_numeric"), 1, 5)
        out["expected_annual_return_min_pct"] = self._clean_number(raw.get("expected_annual_return_min_pct"), -100, 100)
        out["expected_annual_return_max_pct"] = self._clean_number(raw.get("expected_annual_return_max_pct"), -100, 100)

    def _merge_long_term_numerics(self, out: dict[str, Any], raw: Any) -> None:
        if not isinstance(raw, dict):
            return
        out["growth_probability_numeric"] = self._clean_number(raw.get("growth_probability_numeric"), 1, 5)
        out["expected_annual_return_best_case_min_pct"] = self._clean_number(raw.get("expected_annual_return_best_case_min_pct"), -100, 100)
        out["expected_annual_return_best_case_max_pct"] = self._clean_number(raw.get("expected_annual_return_best_case_max_pct"), -100, 100)
        out["long_term_risk_score_numeric"] = self._clean_number(raw.get("long_term_risk_score_numeric"), 1, 10)

    def _clean_long_outlook(self, v: Any) -> dict[str, Any]:
        if not isinstance(v, dict):
            return {}
        keys = ("growth_probability", "expected_annual_return_best_case", "investment_theme", "long_term_risk")
        return {k: self._clean_string(v.get(k)) for k in keys}

    def _clean_dividend_profile(self, v: Any) -> dict[str, Any]:
        if not isinstance(v, dict):
            return {"dividend_consistency": None, "income_reliability": None, "suitable_for_income_investors": False}
        return {
            "dividend_consistency": self._clean_string(v.get("dividend_consistency")),
            "income_reliability": self._clean_string(v.get("income_reliability")),
            "suitable_for_income_investors": bool(v.get("suitable_for_income_investors", False)),
        }

    def _clean_risk_analysis(self, v: Any) -> dict[str, Any]:
        if not isinstance(v, dict):
            return {"primary_risks": [], "volatility_level": None}
        return {
            "primary_risks": self._clean_string_list(v.get("primary_risks")),
            "volatility_level": self._clean_string(v.get("volatility_level")),
        }

    def _fallback_from_raw(self, raw_detail: dict[str, Any]) -> dict[str, Any]:
        about = raw_detail.get("about") or {}
        overview = raw_detail.get("overview") or {}
        symbol = (raw_detail.get("symbol") or "").upper()
        return {
            "ticker_symbol": symbol,
            "company_name": about.get("company_name") or "",
            "sector": about.get("sector") or overview.get("sector") or "",
            "market_position": None,
            "investment_snapshot": {"investment_quality_score": None, "investment_quality_score_numeric": None, "risk_level": None, "risk_score_numeric": None, "return_potential": None, "return_potential_numeric": None, "suitability": None},
            "valuation_analysis": {"valuation_status": None, "valuation_score_numeric": None, "pe_interpretation": None, "pb_interpretation": None, "value_or_growth_style": None},
            "short_term_outlook_0_to_12_months": {"growth_probability": None, "growth_probability_numeric": None, "expected_price_range_change": None, "expected_return_low_pct": None, "expected_return_high_pct": None, "key_triggers": [], "strategy": None, "key_drivers": []},
            "mid_term_outlook_1_to_3_years": {"growth_probability": None, "growth_probability_numeric": None, "expected_annual_return": None, "expected_annual_return_min_pct": None, "expected_annual_return_max_pct": None, "key_drivers": [], "strategy": None, "key_triggers": []},
            "long_term_outlook_3_to_5_years": {"growth_probability": None, "growth_probability_numeric": None, "expected_annual_return_best_case": None, "expected_annual_return_best_case_min_pct": None, "expected_annual_return_best_case_max_pct": None, "investment_theme": None, "long_term_risk": None, "long_term_risk_score_numeric": None},
            "dividend_profile": {"dividend_consistency": None, "dividend_consistency_score_numeric": None, "income_reliability": None, "income_reliability_score_numeric": None, "suitable_for_income_investors": False},
            "financial_strength_monitoring": {"eps_trend": None, "capital_strength": None, "asset_quality": None, "liquidity_position": None},
            "risk_analysis": {"primary_risks": [], "volatility_level": None, "volatility_score_numeric": None},
            "portfolio_strategy_recommendation": {"allocation_size": None, "allocation_max_pct_numeric": None, "holding_period": None, "holding_period_years_numeric": None, "buy_strategy": None},
            "who_should_invest": [],
            "who_should_avoid": [],
            "final_decision": {"invest_now": None, "invest_score_numeric": None, "wait_option": None, "confidence_level": None, "confidence_score_numeric": None, "risk_tier": None, "investability_label": None, "entry_timing": None, "recommendation": None, "summary_verdict": None},
        }
