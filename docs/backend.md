# Backend Documentation

## Overview

The backend is a FastAPI server (`backend/api.py`) backed by SQLite. It manages merchants, generates context-aware offer candidates using a rules engine, handles the full offer lifecycle (generate → claim → redeem), and exposes OSM/Overpass-powered merchant search — all with no external API key required.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   React Frontend                     │
│  - Calls /offers/generate-candidates                 │
│  - On-device Gemma re-ranks candidates               │
│  - Falls back to /api/recommendations/nearby         │
└────────────────────┬────────────────────────────────┘
                     │ HTTP
                     ▼
┌─────────────────────────────────────────────────────┐
│               FastAPI (backend/api.py)               │
│                                                      │
│  Offer lifecycle:                                    │
│    POST /offers/generate-candidates                  │
│    POST /offers/generate                             │
│    POST /offers/{id}/claim                           │
│    POST /offers/{id}/redeem                          │
│    POST /offers/{id}/dismiss                         │
│                                                      │
│  Merchant management:                                │
│    GET/PUT /merchant/{id}/rules                      │
│    GET     /merchant/{id}/stats                      │
│    GET     /merchant/{id}/auto-rules                 │
│    GET     /merchant/{id}/special-offers             │
│                                                      │
│  Discovery:                                          │
│    GET  /api/merchants/nearby                        │
│    POST /api/merchants/search   ← Overpass/OSM       │
│    POST /api/recommendations/nearby                  │
│    POST /api/merchants/claim                         │
│                                                      │
│  User wallet:                                        │
│    GET /user/{id}/wallet                             │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│                  city_wallet.db (SQLite)              │
│                                                      │
│  merchants       — registered merchant profiles      │
│  merchant_stats  — offers sent / accepted / cashback │
│  offers          — full offer lifecycle records      │
│  wallets         — user cashback balances            │
│  auto_offers     — scheduled rule-based offers       │
│  special_offers  — time-bounded manual offers        │
└─────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

### Rules Engine (`backend/rules.py`)

Merchants configure auto-rules (weather match, quiet hours, loyalty, first visit) and special offers. On each `/offers/generate-candidates` call the engine evaluates all active rules for nearby merchants and builds scored candidates.

Rule types (`AutoRuleType`):
- `WEATHER_MATCH` — triggers on cold / rain / hot conditions
- `QUIET_HOUR` — triggers when footfall is below merchant's threshold
- `LOYALTY_REWARD` — triggers after N visits
- `FIRST_VISIT` — one-time welcome offer

### Two-Stage Recommendation

1. **Backend** generates candidates sorted by distance and rule match score.
2. **On-device Gemma 4** (`app/lib/localPersonalization/gemma4Ranker.js`) re-ranks using user intent — user preferences never leave the device.
3. Falls back to backend distance ranking if the local model isn't loaded.

### Merchant Discovery via OSM

`POST /api/merchants/search` queries the Overpass API (OpenStreetMap). No API key required. Results are returned to the frontend for the merchant to claim their place via `POST /api/merchants/claim`.

### Map Assets

Static map tiles are fetched server-side from `staticmap.openstreetmap.de` and proxied through `GET /maps/place-image/{merchant_id}` to avoid CORS issues on the frontend.

---

## Modules

| File | Purpose |
|------|---------|
| `backend/api.py` | All routes, SQLite setup, offer logic, OSM search |
| `backend/rules.py` | Pydantic models and evaluation logic for auto-rules and special offers |
