#!/usr/bin/env python3
"""Sync company list + detail and optional AI analysis to DB. Run: python scripts/sync_all_companies.py [--no-analysis] [--limit N] [--workers N]."""

import argparse
import logging
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

_backend_dir = Path(__file__).resolve().parent.parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

from cache import invalidate_all
from core.client import MerolaganiClient
from database import SessionLocal, init_db
from models import Company, CompanyAnalysis  # noqa: F401 - register mappers
from services.extractor_service import ExtractorService

_print_lock = threading.Lock()
_LOG_DIR = _backend_dir / "logs"
_LOG_DIR.mkdir(exist_ok=True, parents=True)


def _setup_logger() -> logging.Logger:
    logger = logging.getLogger("sync_all_companies")
    if logger.handlers:
        return logger
    logger.setLevel(logging.INFO)
    logger.propagate = False

    formatter = logging.Formatter("%(asctime)s | %(levelname)s | %(message)s")

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(formatter)
    logger.addHandler(console)

    file_handler = logging.FileHandler(_LOG_DIR / "sync_all_companies.log", encoding="utf-8")
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    return logger


LOGGER = _setup_logger()


def _process_one(symbol: str, run_analysis: bool) -> tuple[str, str | None]:
    """Fetch detail and optionally run analysis for one symbol."""
    db = SessionLocal()
    started_at = time.monotonic()
    try:
        LOGGER.info("Start %s", symbol)
        ExtractorService.fetch_and_save(symbol, db, run_analysis=run_analysis)
        elapsed = time.monotonic() - started_at
        LOGGER.info("Done %s in %.1fs", symbol, elapsed)
        return (symbol, None)
    except Exception as e:
        LOGGER.exception("Failed %s", symbol)
        return (symbol, str(e))
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync all companies from Merolagani and store in DB.")
    parser.add_argument("--no-analysis", action="store_true", help="Only fetch detail; do not run AI analysis.")
    parser.add_argument("--limit", type=int, default=0, help="Max number of companies to process (0 = all).")
    parser.add_argument("--workers", type=int, default=5, help="Thread pool size (default: 5).")
    args = parser.parse_args()

    init_db()
    with MerolaganiClient() as client:
        company_list = client.get_company_list()

    total = len(company_list)
    if args.limit > 0:
        company_list = company_list[: args.limit]
    symbols = [(item.get("symbol") or "").strip() for item in company_list]
    symbols = [s for s in symbols if s]

    LOGGER.info("Processing %s companies (workers=%s)", len(symbols), args.workers)
    LOGGER.info("Mode: %s", "detail only" if args.no_analysis else "detail + AI analysis")

    run_analysis = not args.no_analysis
    ok = 0
    err = 0
    done = 0
    started_at = time.monotonic()

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(_process_one, symbol, run_analysis): symbol for symbol in symbols}
        for future in as_completed(futures):
            symbol, error = future.result()
            done += 1
            if error is None:
                ok += 1
                with _print_lock:
                    LOGGER.info("[%s/%s] %s OK", done, len(symbols), symbol)
            else:
                err += 1
                with _print_lock:
                    LOGGER.error("[%s/%s] %s FAILED: %s", done, len(symbols), symbol, error)

    total_elapsed = time.monotonic() - started_at
    LOGGER.info("Done. OK: %s, Failed: %s, Elapsed: %.1fs", ok, err, total_elapsed)

    try:
        invalidate_all()
        LOGGER.info("API cache invalidated")
    except Exception as e:
        LOGGER.warning("Could not invalidate cache: %s", e)


if __name__ == "__main__":
    main()
