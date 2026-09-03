"""Fetch + extract and save to DB."""

import hashlib
import json
from datetime import datetime, timezone
import logging
from typing import Any

from core.client import MerolaganiClient
from core.company_extractor_llm import CompanyExtractorLLM
from sqlalchemy.orm import Session

from models.company import Company
from models.company_analysis import CompanyAnalysis


logger = logging.getLogger(__name__)


def _financial_hash(raw_detail: dict[str, Any]) -> str:
    """Short hash of the fields that drive LLM analysis. Unchanged data → same hash → skip LLM."""
    overview = raw_detail.get("overview") or {}
    key = {
        "market_price": overview.get("market_price"),
        "eps": overview.get("eps"),
        "pe": overview.get("p_e_ratio") or overview.get("pe_ratio"),
        "bv": overview.get("book_value"),
        "pbv": overview.get("pbv"),
        "div": raw_detail.get("dividend_history"),
        "bonus": raw_detail.get("bonus_history"),
    }
    return hashlib.sha256(
        json.dumps(key, sort_keys=True, default=str).encode()
    ).hexdigest()[:16]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class ExtractorService:
    @staticmethod
    def fetch_and_save(symbol: str, db: Session, *, run_analysis: bool = False) -> Company:
        symbol = symbol.upper().strip()
        with MerolaganiClient() as client:
            raw = client.get_company_detail(symbol)
        about = raw.get("about") or {}
        name = about.get("company_name") or raw.get("company_display_name") or symbol
        sector = about.get("sector") or (raw.get("overview") or {}).get("sector")

        new_hash = _financial_hash(raw) if run_analysis else None

        company = db.query(Company).filter(Company.symbol == symbol).first()
        if company:
            company.name = name
            company.sector = sector
            company.raw_detail = raw
            if run_analysis:
                if company.analysis_hash == new_hash and company.analysis:
                    logger.debug("Skipping LLM for %s — financial data unchanged", symbol)
                else:
                    try:
                        extractor = CompanyExtractorLLM()
                        company.analysis = extractor.extract_from_raw_detail(raw, db=db)
                        company.analysis_hash = new_hash
                        _append_analysis_record(db, company.id, company.analysis)
                    except Exception:
                        company.analysis = None
            db.commit()
            db.refresh(company)
            return company

        analysis = None
        if run_analysis:
            try:
                extractor = CompanyExtractorLLM()
                analysis = extractor.extract_from_raw_detail(raw, db=db)
            except Exception:
                pass
        company = Company(symbol=symbol, name=name, sector=sector, raw_detail=raw, analysis=analysis, analysis_hash=new_hash if analysis else None)
        db.add(company)
        db.commit()
        db.refresh(company)
        if analysis is not None:
            _append_analysis_record(db, company.id, analysis)
            db.commit()

        return company


def _append_analysis_record(db: Session, company_id: int, analysis: dict) -> None:
    rec = CompanyAnalysis(company_id=company_id, analyzed_at=_utcnow(), analysis=analysis)
    db.add(rec)
