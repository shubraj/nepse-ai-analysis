# NEPSE Research (Merolagani Company Data)

- **backend/** – FastAPI + SQLAlchemy + SQLite (API and core logic)
- **frontend/** – React + TypeScript (Vite)

## Docker (all services)

From project root:

```bash
cp .env.example .env
# Edit .env and set OLLAMA_API_KEY (required for analysis)

docker compose up -d
```

- App: http://localhost:8212 (frontend + nginx; `/api` proxied to backend)
- Backend API: http://localhost:8212/api (via proxy)
- Services: backend, frontend (nginx), Redis, Celery worker, Celery beat

Environment variables are read from the root `.env` file (see `.env.example`). Data and logs are stored in Docker volumes (`backend_data`, `backend_logs`).

## Backend

From project root:

```bash
cd backend
uv run uvicorn main:app --reload
# or: uv run python run.py
```

- API: http://127.0.0.1:8000  
- Docs: http://127.0.0.1:8000/docs  

Put `.env` in `backend/` (e.g. `OLLAMA_API_KEY`, `OLLAMA_MODEL`, `OLLAMA_HOST`). Database: `backend/data/merolagani.db`.

**Celery:** Run a worker and beat process from `backend/` (Redis required) to sync all companies and run analysis every 12 hours. See `backend/README.md`.

## Frontend

From project root:

```bash
cd frontend
npm install
npm run dev
```

App: http://localhost:5173 (proxies `/api` to backend).

## API (read-only, public)

Data is updated only via Celery (scheduled sync). The API exposes no endpoints that trigger fetching or extraction.

- `GET /api/companies?q=&skip=0&limit=100` – list companies
- `GET /api/companies/{symbol}?analysis_date=YYYY-MM-DD` – get company (optionally analysis on or before date)
- `GET /api/companies/{symbol}/analyses` – list analysis runs (by date)
- `GET /api/companies/{symbol}/analyses/{id}` – get one analysis snapshot
