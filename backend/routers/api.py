"""API routes (companies, analyses)."""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from cache import get as cache_get, set as cache_set
from config import CACHE_KEY_PREFIX
from database import get_db
from models.company import Company
from models.company_analysis import CompanyAnalysis
from schemas.company import CompanyResponse
from schemas.company_analysis import CompanyAnalysisListItem, CompanyAnalysisResponse

router = APIRouter()


def _companies_list_key(skip: int, limit: int, q: str | None, risk_tier: str | None, investability: str | None, entry_timing: str | None) -> str:
    return f"{CACHE_KEY_PREFIX}companies:list:{skip}:{limit}:{q or ''}:{risk_tier or ''}:{investability or ''}:{entry_timing or ''}"


@router.get("/companies", response_model=list[CompanyResponse])
def list_companies(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    q: str | None = None,
    risk_tier: str | None = Query(None, description="Filter: low, moderate, high"),
    investability: str | None = Query(None, description="Filter: high, moderate, low"),
    entry_timing: str | None = Query(None, description="Filter: now, wait, avoid"),
):
    cache_key = _companies_list_key(skip, limit, q, risk_tier, investability, entry_timing)
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
