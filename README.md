# City Wallet Recommendation

AI-powered, location-aware offer recommendation system for a digital city wallet. Merchants set discount rules; the backend matches users to nearby offers based on context (location, weather, time); an on-device model ranks them privately.

---

## Project Structure

```
.
├── app/                    # React frontend (Vite)
│   ├── App.jsx             # Main app shell and routing
│   ├── MerchantView.jsx    # Merchant dashboard UI
│   ├── PreferenceSheet.jsx # User preference bottom sheet
│   ├── api.js              # HTTP client for backend calls
│   ├── public/             # On-device AI assets
│   │   ├── models/         # Gemma WASM model files
│   │   ├── localPersonalization/  # On-device offer ranking logic
│   │   ├── preferenceHistory.js   # Tracks user preference signals
│   │   ├── privacyBoundary.js     # Keeps personal data on-device
│   │   └── walletPreferences.js   # Persisted preference state
│   └── lib/                # Shared UI utilities
│
├── backend/                # FastAPI server
│   ├── api.py              # REST endpoints + APScheduler lifecycle
│   ├── app.py              # App entry point / factory
│   └── rules.py            # Merchant auto-rule and special offer models
│
├── recommendation_engine/  # Data pipeline (OSM / Overpass)
│   └── src/
│       ├── api.py          # Overpass API client for POI fetching
│       ├── db.py           # SQLite schema and queries
│       ├── gather_data.py  # Orchestrates POI data collection
│       └── store_data.py   # In-memory Polars DataFrame cache
│
├── data/                   # Static / seed data files
├── docs/                   # Extended architecture documentation
│   └── backend.md          # Backend design decisions and API reference
├── city_wallet.db          # SQLite database
└── pyproject.toml          # Python project config (uv / hatchling)
```

---

## Installation

### Backend (Python)

Requires Python 3.10+ and [uv](https://github.com/astral-sh/uv).

```bash
uv sync
```

### Frontend (Node)

```bash
cd app
npm install
```

---

## Running

### Backend

```bash
uvicorn backend.api:app --reload --port 8000
```

### Frontend

```bash
cd app
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies API calls to the backend on port `8000`.

---

## Tests

```bash
cd app
npm test
```
