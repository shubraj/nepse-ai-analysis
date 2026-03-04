"""Fetch + extract and save to DB."""

from datetime import datetime, timezone

from core.client import MerolaganiClient
from core.company_extractor_llm import CompanyExtractorLLM
from sqlalchemy.orm import Session

from models.company import Company
from models.company_analysis import CompanyAnalysis


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

        company = db.query(Company).filter(Company.symbol == symbol).first()
        if company:
            company.name = name
            company.sector = sector
            company.raw_detail = raw
            if run_analysis:
                try:
                    extractor = CompanyExtractorLLM()
                    company.analysis = extractor.extract_from_raw_detail(raw)
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
                analysis = extractor.extract_from_raw_detail(raw)
            except Exception:
                pass
        company = Company(symbol=symbol, name=name, sector=sector, raw_detail=raw, analysis=analysis)
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
