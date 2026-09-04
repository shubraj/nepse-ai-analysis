"""NepseAI Top 30: a market-cap-weighted index of NEPSE's 30 largest companies."""

import logging
from typing import Any

from sqlalchemy.orm import Session

from cache import get as cache_get, set as cache_set
from config import CACHE_KEY_PREFIX
from core.client import MerolaganiClient
from models.company import Company

logger = logging.getLogger(__name__)

INDEX_SIZE = 30
INDEX_CACHE_TTL = 6 * 3600  # 6 hours, matches price-history cache cadence
PRICE_HISTORY_CACHE_TTL = 6 * 3600


def _parse_market_cap(overview: dict[str, Any] | None) -> float | None:
    if not overview:
        return None
    raw = overview.get("market_capitalization")
    if raw is None:
        return None
    try:
        return float(str(raw).replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def get_top30_constituents(db: Session) -> list[dict[str, Any]]:
    """Current 30 largest NEPSE companies by market cap, with index weight."""
    companies = db.query(Company).filter(Company.raw_detail.isnot(None)).all()
    rows: list[dict[str, Any]] = []
    for c in companies:
        mc = _parse_market_cap(c.overview)
        if mc is None or mc <= 0:
            continue
        rows.append({
            "symbol": c.symbol,
            "name": c.name,
            "sector": c.sector,
            "market_cap": mc,
        })
    rows.sort(key=lambda r: r["market_cap"], reverse=True)
    top = rows[:INDEX_SIZE]
    total_mc = sum(r["market_cap"] for r in top) or 1
    for r in top:
        r["weight_pct"] = round(r["market_cap"] / total_mc * 100, 2)
    return top


def _price_history_cache_key(symbol: str) -> str:
    return f"{CACHE_KEY_PREFIX}price-history:{symbol.upper()}"


def _fetch_history_cached(symbol: str) -> list[dict[str, Any]]:
    cache_key = _price_history_cache_key(symbol)
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    with MerolaganiClient() as client:
        data = client.get_price_history(symbol)
    cache_set(cache_key, data, ttl=PRICE_HISTORY_CACHE_TTL)
    return data


def _index_cache_key() -> str:
    return f"{CACHE_KEY_PREFIX}index:top30"


def compute_top30_index(db: Session, days: int = 3650) -> dict[str, Any]:
    """
    Equal-start, market-cap-weighted index: each constituent is normalized to
    100 at the first date it has price data, then blended by market-cap weight
    on each date. New/late-listed constituents join the blend once they have data.
    """
    cached = cache_get(_index_cache_key())
    if cached is not None:
        return {"series": cached["series"][-days:], "constituents": cached["constituents"]}

    constituents = get_top30_constituents(db)
    if not constituents:
        return {"series": [], "constituents": []}

    per_symbol: dict[str, dict[str, float]] = {}
    for c in constituents:
        try:
            hist = _fetch_history_cached(c["symbol"])
        except Exception as e:
            logger.warning("Price history fetch failed for %s: %s", c["symbol"], e)
            hist = []
        per_symbol[c["symbol"]] = {h["date"]: h["close"] for h in hist if h.get("close")}

    all_dates = sorted({d for prices in per_symbol.values() for d in prices})
    if not all_dates:
        return {"series": [], "constituents": constituents}

    last_price: dict[str, float] = {}
    base_value: dict[str, float] = {}
    series: list[dict[str, Any]] = []

    for date in all_dates:
        weighted_sum = 0.0
        weight_used = 0.0
        for c in constituents:
            sym = c["symbol"]
            price_today = per_symbol[sym].get(date)
            if price_today is not None:
                last_price[sym] = price_today
            price = last_price.get(sym)
            if price is None:
                continue
            if sym not in base_value:
                base_value[sym] = price
            normalized = price / base_value[sym] * 100
            weight = c["market_cap"]
            weighted_sum += normalized * weight
            weight_used += weight
        if weight_used > 0:
            series.append({"date": date, "value": round(weighted_sum / weight_used, 3)})

    cache_set(_index_cache_key(), {"series": series, "constituents": constituents}, ttl=INDEX_CACHE_TTL)
    return {"series": series[-days:], "constituents": constituents}
