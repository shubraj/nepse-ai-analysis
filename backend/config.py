"""Backend config."""

import os
from pathlib import Path

try:
    from dotenv import load_dotenv
    _dir = Path(__file__).resolve().parent
    load_dotenv(_dir / ".env",override=True)
    load_dotenv(_dir.parent / ".env",override=True)
except ImportError:
    pass

BASE_DIR = Path(__file__).resolve().parent
DATABASE_URL = os.getenv("DATABASE_URL")

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://127.0.0.1:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://127.0.0.1:6379/0")

CACHE_REDIS_URL = os.getenv("CACHE_REDIS_URL", CELERY_BROKER_URL)
CACHE_KEY_PREFIX = os.getenv("CACHE_KEY_PREFIX", "nepse:cache:")
CACHE_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", "14400"))

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "google/gemini-flash-1.5")

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
SITE_URL = os.getenv("SITE_URL", "https://nepseai.shubraj.com").rstrip("/")
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))
RETRY_DELAY = float(os.getenv("RETRY_DELAY", "1.0"))

REQUIRED_TOP_LEVEL_FIELDS = [
    "ticker_symbol",
    "company_name",
    "sector",
    "investment_snapshot",
    "valuation_analysis",
    "dividend_profile",
    "risk_analysis",
    "final_decision",
]
