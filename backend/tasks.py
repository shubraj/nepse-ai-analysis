"""Celery task: sync companies and run analysis."""

import logging

from cache import invalidate_all
from celery_app import app
from core.client import MerolaganiClient
from database import SessionLocal, init_db
from models import Company, CompanyAnalysis  # noqa: F401 - register mappers
from services.extractor_service import ExtractorService

logger = logging.getLogger(__name__)


@app.task(bind=True, name="tasks.run_all_companies_sync")
def run_all_companies_sync(self):
    """
    Fetch company list from Merolagani, for each company fetch detail + run AI analysis,
    insert or update Company and append CompanyAnalysis with analyzed_at.
    """
    init_db()
    db = SessionLocal()
    try:
        with MerolaganiClient() as client:
            company_list = client.get_company_list()
        total = len(company_list)
        logger.info("Starting sync for %d companies", total)
        errors = 0
        for item in company_list:
            symbol = (item.get("symbol") or "").strip()
            if not symbol:
                continue
            try:
                ExtractorService.fetch_and_save(symbol, db, run_analysis=True)
            except Exception as e:
                errors += 1
                logger.warning("Failed %s: %s", symbol, e)
        logger.info("Sync done: %d total, %d errors", total, errors)
        try:
            invalidate_all()
        except Exception as e:
            logger.warning("Cache invalidation failed: %s", e)
        return {"total": total, "errors": errors}
    finally:
        db.close()



