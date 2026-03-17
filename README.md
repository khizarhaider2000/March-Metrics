# March Metrics — NCAA Bracket Builder

A full-stack sports analytics app for building NCAA tournament brackets with advanced metrics.

## Architecture

```
/
├── frontend/    → Next.js 14 (App Router) + TypeScript + Tailwind CSS
└── backend/     → FastAPI + Python + SQLite
```

### Frontend (`/frontend`)
- **Framework:** Next.js 14 App Router
- **Language:** TypeScript
- **Styling:** Tailwind CSS (dark, premium sports UI)
- **Port:** `3000`
- Proxies `/api/*` requests to the FastAPI backend via `next.config.ts`

### Backend (`/backend`)
- **Framework:** FastAPI
- **Language:** Python 3.11+
- **Database:** SQLite (MVP) via `DATABASE_URL` env var
- **Port:** `8000`
- CORS pre-configured for `http://localhost:3000`

---

## Running Locally

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

API docs available at: `http://localhost:8000/docs`

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

App available at: `http://localhost:3000`

---

## Pages

| Route | Description |
|---|---|
| `/` | Home — feature overview and quick nav |
| `/team-rankings` | Advanced metrics table for all 68 teams |
| `/matchup-analyzer` | Head-to-head simulation with weight profiles |
| `/bracket-builder` | Full interactive bracket builder |

## Backend Folder Structure

```
backend/app/
├── main.py          → FastAPI app + CORS + router registration
├── api/
│   └── routes/
│       └── health.py    → GET /api/health
├── models/          → ORM / dataclass models (team, bracket, …)
├── schemas/         → Pydantic request/response schemas
└── services/        → Business logic (ranking, simulation, bracket)
```
