# Backend – FastAPI + SQLAlchemy + SQLite + Celery

```bash
cd backend
uv sync
uv run uvicorn main:app --reload
# or: uv run python run.py
```

**One-off sync (no Celery)**  
To fetch all companies, their details, and run AI analysis and store in the DB:

```bash
cd backend
uv run python scripts/sync_all_companies.py
```

Options: `--no-analysis` (only fetch detail, no Gemini), `--limit N` (process first N companies).

**Celery (sync all companies every 12 hours)**  
Requires Redis (e.g. `redis-server`). From `backend/`:

```bash
# Terminal 1: worker
uv run celery -A celery_app worker -l info

# Terminal 2: beat (scheduler)
uv run celery -A celery_app beat -l info
```

Set `CELERY_BROKER_URL` and `CELERY_RESULT_BACKEND` in `.env` if not using default Redis. If Redis requires a password: `redis://:YOUR_PASSWORD@127.0.0.1:6379/0`. The task `tasks.run_all_companies_sync` runs every 12 hours, fetches all companies from Merolagani, stores new ones, and runs AI analysis; each run is stored in `company_analyses` with `analyzed_at`.

- **main.py** – FastAPI app entrypoint
- **database.py** – SQLAlchemy engine, session, `get_db`, `init_db`
- **config.py** – Paths, `DATABASE_URL`, Celery broker, Gemini env
- **celery_app.py** – Celery app and beat schedule (every 12 h)
- **tasks.py** – `run_all_companies_sync` task
- **routers/** – API routes (read-only; no endpoints that trigger fetch or extraction – use scripts/Celery)
- **models/** – Company, CompanyAnalysis (history by date)
- **schemas/** – Pydantic request/response schemas
- **services/** – Extractor and Merolagani client wrappers
- **core/** – Merolagani HTTP client and Gemini extractor
- **data/** – SQLite DB (created on first run)
- **format.json** – Target schema for AI analysis
- **.env** – Optional: `GEMINI_API_KEY`, `GEMINI_MODEL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`

API docs: http://127.0.0.1:8000/docs
