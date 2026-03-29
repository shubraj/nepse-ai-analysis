#!/usr/bin/env python3
"""Company data extractor via Gemini; output follows format.json."""

import json
import logging
import os
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

try:
    from google import genai
except ImportError:
    raise ImportError("google-genai is required. Install: pip install google-genai")

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


MAX_RETRIES = _env_int("MAX_RETRIES", 3)
RETRY_DELAY = _env_float("RETRY_DELAY", 1.0)

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

_EXTRACTION_PROMPT = """NEPSE financial analyst. Output strict JSON analysis.

Required fields:
- ticker_symbol, company_name, sector, market_position
- investment_snapshot: investment_quality_score(text), investment_quality_score_numeric(1-10), risk_level(text), risk_score_numeric(1-10), return_potential(text), return_potential_numeric(1-10), suitability(text)
- valuation_analysis: valuation_status(Undervalued/Fairly/Overvalued), valuation_score_numeric(-1/0/1), pe_interpretation, pb_interpretation, value_or_growth_style
- short_term_outlook_0_to_12_months: growth_probability(text), growth_probability_numeric(1-5), expected_price_range_change, expected_return_low_pct, expected_return_high_pct, key_triggers[], strategy
- mid_term_outlook_1_to_3_years: growth_probability_numeric(1-5), expected_annual_return(text), expected_annual_return_min_pct, expected_annual_return_max_pct, key_drivers[], strategy
- long_term_outlook_3_to_5_years: growth_probability_numeric(1-5), expected_annual_return_best_case(text), expected_annual_return_best_case_min_pct, expected_annual_return_best_case_max_pct, investment_theme, long_term_risk, long_term_risk_score_numeric(1-10)
- dividend_profile: dividend_consistency(text), dividend_consistency_score_numeric(1-10), income_reliability(text), income_reliability_score_numeric(1-10), suitable_for_income_investors(boolean)
- financial_strength_monitoring: eps_trend, capital_strength, asset_quality, liquidity_position
- risk_analysis: primary_risks[3-5], volatility_level(text), volatility_score_numeric(1-10)
- portfolio_strategy_recommendation: allocation_size(text), allocation_max_pct_numeric, holding_period(text), holding_period_years_numeric, buy_strategy
- who_should_invest[2-4], who_should_avoid[2-4]
- final_decision: invest_now(text), invest_score_numeric(0/0.5/1), wait_option(text), confidence_level(text), confidence_score_numeric(1-10), risk_tier(Low/Moderate/High), investability_label(High/Moderate/Low), entry_timing(Now/Wait/Avoid), recommendation(Consider/Watch/Avoid), summary_verdict

Rules: risk_tier=1-4:Low,5-6:Moderate,7-10:High. investability=avg(quality,confidence)>=7:High,>=4:Moderate. entry_timing>=0.5:Now,>0:Wait,0:Avoid. recommendation=Consider if Now,Watch if Wait,Avoid if Avoid.

Context: {financial_context}"""


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
    def __init__(self, api_key: str | None = None, model: str | None = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError(
                "Gemini API key required. Set GEMINI_API_KEY or pass api_key= to CompanyExtractorLLM(api_key=...)"
            )
        self.model = model or os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
        self.client = genai.Client(api_key=self.api_key)
        self._format_dict = self._load_format()
        self.response_schema = build_schema_from_format(self._format_dict)

    def _load_format(self) -> dict[str, Any]:
        if not _FORMAT_JSON_PATH.exists():
            raise FileNotFoundError(f"Format schema not found: {_FORMAT_JSON_PATH}")
        with open(_FORMAT_JSON_PATH, encoding="utf-8") as f:
            return json.load(f)

    def _query_model(
        self,
        prompt: str,
        max_retries: int = MAX_RETRIES,
        retry_delay: float = RETRY_DELAY,
        response_schema: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        schema = response_schema or self.response_schema
        for attempt in range(max_retries):
            try:
                response = self.client.models.generate_content(
                    model=self.model,
                    contents=prompt,
                    config={
                        "response_mime_type": "application/json",
                        "response_schema": schema,
                    },
                )
                text = (response.text or "").strip()
                return json.loads(text)
            except json.JSONDecodeError as e:
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)
                    retry_delay *= 2
                    continue
                raise RuntimeError(f"JSON parse failed after {max_retries} attempts: {e}") from e
            except Exception as e:
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)
                    retry_delay *= 2
                    continue
                raise RuntimeError(f"Gemini API failed after {max_retries} attempts: {e}") from e
        raise RuntimeError("Unreachable")

    def _build_financial_context(self, raw_detail: dict[str, Any]) -> dict[str, Any]:
        about = raw_detail.get("about") or {}
        overview = raw_detail.get("overview") or {}
        dividends = raw_detail.get("dividend_history") or []
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
        # Limit to last 5 dividends (from 15)
        dividend_values = []
        for d in dividends[:5]:
            v = d.get("value") or ""
            fy = d.get("fiscal_year") or ""
            if v or fy:
                dividend_values.append({"v": v, "fy": fy})  # Shortened keys
        last_dividend = dividend_values[0] if dividend_values else None

        # Shorter keys, removed less critical fields
        return {
            "sym": symbol,
            "name": about.get("company_name") or raw_detail.get("company_display_name") or "",
            "sector": about.get("sector") or overview.get("sector") or "",
            "mkt": {
                "price": _num(overview.get("market_price")),
                "change": overview.get("pct_change") or "",
                "52w": overview.get("52_weeks_high_low") or "",
                "cap": overview.get("market_capitalization") or "",
                "yield": overview.get("1_year_yield") or "",
            },
            "val": {
                "eps": _num(overview.get("eps")),
                "pe": pe,
                "bv": _num(overview.get("book_value")),
                "pbv": pbv,
            },
            "div": dividend_values,
            "div_last": last_dividend,
        }

    def extract_from_raw_detail(self, raw_detail: dict[str, Any]) -> dict[str, Any]:
        financial_context = self._build_financial_context(raw_detail)
        context_str = json.dumps(financial_context, indent=2, default=str)
        prompt = _EXTRACTION_PROMPT.format(financial_context=context_str)
        try:
            data = self._query_model(prompt)
            return self._validate_and_clean(data, raw_detail)
        except Exception as e:
            logger.error("Gemini extraction failed: %s", e)
            return self._fallback_from_raw(raw_detail)

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
        """Overwrite final_decision labels from numeric scores."""
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
