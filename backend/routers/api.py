"""API routes (companies, analyses)."""

import html
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy import or_
from sqlalchemy.orm import Session

from cache import get as cache_get, set as cache_set
from config import CACHE_KEY_PREFIX, SITE_URL
from database import get_db
from models.company import Company
from models.company_analysis import CompanyAnalysis
from schemas.company import CompanyResponse
from schemas.company_analysis import CompanyAnalysisListItem, CompanyAnalysisResponse
from schemas.market_sentiment import MarketSentimentResponse
from schemas.sector_performance import SectorPerformanceItem, SectorPerformanceResponse
from schemas.suggestions import SuggestionItem, SuggestionsResponse
from services.market_sentiment import get_market_sentiment
from services.sector_performance import get_sector_performance
from services.suggestions import get_suggestions as get_suggestions_service

router = APIRouter()

MARKET_SENTIMENT_CACHE_TTL = 300  # 5 min


def _escape_loc(loc: str) -> str:
    return html.escape(loc, quote=True)


def _sitemap_xml(symbols: list[str]) -> str:
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for loc, changefreq, priority in [
        (f"{SITE_URL}/", "daily", "1.0"),
        (f"{SITE_URL}/companies", "daily", "0.9"),
    ]:
        lines.append(f"  <url><loc>{_escape_loc(loc)}</loc><changefreq>{changefreq}</changefreq><priority>{priority}</priority></url>")
    for symbol in symbols:
        loc = f"{SITE_URL}/company/{symbol}"
        lines.append(f"  <url><loc>{_escape_loc(loc)}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>")
    lines.append("</urlset>")
    return "\n".join(lines)


@router.get("/sector-performance", response_model=SectorPerformanceResponse)
def get_sector_performance_endpoint(db: Session = Depends(get_db)):
    """Avg price change and up/down counts per sector."""
    cache_key = f"{CACHE_KEY_PREFIX}sector-performance"
    cached = cache_get(cache_key)
    if cached is not None:
        return SectorPerformanceResponse(**cached)
    data = get_sector_performance(db)
    cache_set(cache_key, {"sectors": data}, ttl=MARKET_SENTIMENT_CACHE_TTL)
    return SectorPerformanceResponse(sectors=[SectorPerformanceItem(**s) for s in data])


@router.get("/market-sentiment", response_model=MarketSentimentResponse)
def get_market_sentiment_endpoint(db: Session = Depends(get_db)):
    """Overall market sentiment from recent price trend (pct_change)."""
    cache_key = f"{CACHE_KEY_PREFIX}market-sentiment"
    cached = cache_get(cache_key)
    if cached is not None:
        return MarketSentimentResponse(**cached)
    data = get_market_sentiment(db)
    cache_set(cache_key, data, ttl=MARKET_SENTIMENT_CACHE_TTL)
    return MarketSentimentResponse(**data)


@router.get("/sitemap.xml")
def get_sitemap(db: Session = Depends(get_db)):
    cache_key = f"{CACHE_KEY_PREFIX}sitemap"
    cached = cache_get(cache_key)
    if cached is not None:
        return Response(content=cached, media_type="application/xml")
    symbols = [r[0] for r in db.query(Company.symbol).order_by(Company.symbol).all()]
    xml_body = _sitemap_xml(symbols)
    cache_set(cache_key, xml_body)
    return Response(content=xml_body, media_type="application/xml")


def _companies_list_key(skip: int, limit: int, q: str | None, risk_tier: str | None, investability: str | None, entry_timing: str | None, sector: str | None = None) -> str:
    return f"{CACHE_KEY_PREFIX}companies:list:{skip}:{limit}:{q or ''}:{risk_tier or ''}:{investability or ''}:{entry_timing or ''}:{sector or ''}"


SUGGESTION_RATELIMIT_TTL = 86400  # 24h per user (IP)
SUGGESTION_CACHE_TTL = 259200  # 72h: same amount_npr + goal + max_stocks returns cached for any user


def _client_ip(request: Request) -> str:
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip.strip()
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.get("/suggestions", response_model=SuggestionsResponse)
def get_suggestions(
    request: Request,
    db: Session = Depends(get_db),
    amount_npr: int = Query(..., ge=1000, description="Amount to invest in NPR (min 1000)"),
    goal: str = Query(..., description="Investment horizon: short_term, mid_term, or long_term"),
    max_stocks: int = Query(6, ge=1, le=6, description="Number of stocks to suggest (1–6)"),
):
    if goal not in ("short_term", "mid_term", "long_term"):
        raise HTTPException(status_code=400, detail="goal must be short_term, mid_term, or long_term")

    ip = _client_ip(request)
    ratelimit_key = f"{CACHE_KEY_PREFIX}suggestion:ratelimit:{ip}"
    if cache_get(ratelimit_key) is not None:
        raise HTTPException(
            status_code=429,
            detail="You've used your one free suggestion for today - the AI needs to nap. Come back tomorrow, or buy it a coffee so it stays awake longer.",
        )

    cache_key = f"{CACHE_KEY_PREFIX}suggestion:result:{amount_npr}:{goal}:{max_stocks}"
    cached = cache_get(cache_key)
    if isinstance(cached, dict) and cached.get("suggestions"):
        cache_set(ratelimit_key, "1", ttl=SUGGESTION_RATELIMIT_TTL)
        return SuggestionsResponse(
            suggestions=[SuggestionItem(**x) for x in cached["suggestions"]],
            expected_overall_return_pct=cached.get("expected_overall_return_pct"),
        )

    items, overall = get_suggestions_service(db, amount_npr, goal, max_stocks)
    cache_set(cache_key, {"suggestions": items, "expected_overall_return_pct": overall}, ttl=SUGGESTION_CACHE_TTL)
    cache_set(ratelimit_key, "1", ttl=SUGGESTION_RATELIMIT_TTL)
    return SuggestionsResponse(suggestions=[SuggestionItem(**x) for x in items], expected_overall_return_pct=overall)


@router.get("/companies/sectors", response_model=list[str])
def list_sectors(db: Session = Depends(get_db)):
    cache_key = f"{CACHE_KEY_PREFIX}companies:sectors"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    rows = db.query(Company.sector).filter(Company.sector.isnot(None), Company.sector != "").distinct().order_by(Company.sector).all()
    result = [r[0] for r in rows if r[0]]
    cache_set(cache_key, result)
    return result


@router.get("/companies", response_model=list[CompanyResponse])
def list_companies(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    q: str | None = None,
    risk_tier: str | None = Query(None, description="Filter: low, moderate, high"),
    investability: str | None = Query(None, description="Filter: high, moderate, low"),
    entry_timing: str | None = Query(None, description="Filter: now, wait, avoid"),
    sector: str | None = Query(None, description="Filter by sector (exact match)"),
):
    cache_key = _companies_list_key(skip, limit, q, risk_tier, investability, entry_timing, sector)
    cached = cache_get(cache_key)
    if cached is not None:
        return [CompanyResponse(**item) for item in cached]

    query = db.query(Company).order_by(Company.symbol)
    if q and q.strip():
        q = q.strip()
        query = query.filter(
            or_(
                Company.symbol.ilike(f"%{q}%"),
                Company.name.ilike(f"%{q}%"),
                Company.sector.ilike(f"%{q}%"),
            )
        )
    if sector and sector.strip():
        query = query.filter(Company.sector == sector.strip())
    if risk_tier or investability or entry_timing:
        from services.screening import company_matches
        rows = query.limit(500).all()
        r = risk_tier.lower().strip() if risk_tier else None
        i = investability.lower().strip() if investability else None
        e = entry_timing.lower().strip() if entry_timing else None
        rows = [c for c in rows if company_matches(c.analysis, risk_tier=r, investability=i, entry_timing=e)]
        result = rows[skip : skip + limit]
    else:
        result = query.offset(skip).limit(limit).all()

    cache_set(cache_key, [CompanyResponse.model_validate(r).model_dump(mode="json") for r in result])
    return result


def _company_key(symbol: str, analysis_date: str | None) -> str:
    return f"{CACHE_KEY_PREFIX}company:{symbol.upper()}:{analysis_date or 'latest'}"


@router.get("/companies/{symbol}", response_model=CompanyResponse)
def get_company(
    symbol: str,
    db: Session = Depends(get_db),
    analysis_date: str | None = Query(None, description="YYYY-MM-DD: return analysis on or before this date"),
):
    cache_key = _company_key(symbol, analysis_date)
    cached = cache_get(cache_key)
    if cached is not None:
        return CompanyResponse(**cached)

    company = db.query(Company).filter(Company.symbol == symbol.upper()).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if analysis_date:
        try:
            end_of_day = datetime.strptime(analysis_date, "%Y-%m-%d") + timedelta(days=1)
        except ValueError:
            raise HTTPException(status_code=400, detail="analysis_date must be YYYY-MM-DD")
        rec = (
            db.query(CompanyAnalysis)
            .filter(CompanyAnalysis.company_id == company.id, CompanyAnalysis.analyzed_at < end_of_day)
            .order_by(CompanyAnalysis.analyzed_at.desc())
            .first()
        )
        if rec:
            out = CompanyResponse(
                id=company.id,
                symbol=company.symbol,
                name=company.name,
                sector=company.sector,
                analysis=rec.analysis,
                overview=company.raw_detail.get("overview") if company.raw_detail else None,
                created_at=company.created_at,
                updated_at=company.updated_at,
            )
            cache_set(cache_key, out.model_dump(mode="json"))
            return out
    cache_set(cache_key, CompanyResponse.model_validate(company).model_dump(mode="json"))
    return company


def _company_analyses_list_key(symbol: str) -> str:
    return f"{CACHE_KEY_PREFIX}company:{symbol.upper()}:analyses"


@router.get("/companies/{symbol}/analyses", response_model=list[CompanyAnalysisListItem])
def list_company_analyses(symbol: str, db: Session = Depends(get_db)):
    cache_key = _company_analyses_list_key(symbol)
    cached = cache_get(cache_key)
    if cached is not None:
        return [CompanyAnalysisListItem(**item) for item in cached]

    company = db.query(Company).filter(Company.symbol == symbol.upper()).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    rows = (
        db.query(CompanyAnalysis)
        .filter(CompanyAnalysis.company_id == company.id)
        .order_by(CompanyAnalysis.analyzed_at.desc())
        .all()
    )
    result = [CompanyAnalysisListItem.model_validate(r) for r in rows]
    cache_set(cache_key, [r.model_dump(mode="json") for r in result])
    return result


def _company_analysis_key(symbol: str, analysis_id: int) -> str:
    return f"{CACHE_KEY_PREFIX}company:{symbol.upper()}:analysis:{analysis_id}"


@router.get("/companies/{symbol}/analyses/{analysis_id}", response_model=CompanyAnalysisResponse)
def get_company_analysis(symbol: str, analysis_id: int, db: Session = Depends(get_db)):
    cache_key = _company_analysis_key(symbol, analysis_id)
    cached = cache_get(cache_key)
    if cached is not None:
        return CompanyAnalysisResponse(**cached)

    company = db.query(Company).filter(Company.symbol == symbol.upper()).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    rec = db.query(CompanyAnalysis).filter(
        CompanyAnalysis.id == analysis_id,
        CompanyAnalysis.company_id == company.id,
    ).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Analysis not found")
    result = CompanyAnalysisResponse.model_validate(rec)
    cache_set(cache_key, result.model_dump(mode="json"))
    return result
