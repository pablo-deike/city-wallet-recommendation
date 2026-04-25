# Backend Documentation

## Overview

The backend provides a data layer for the City Wallet application. It fetches merchant (POI) and weather data from Google APIs, stores it in-memory using Polars DataFrames, and exposes it via FastAPI endpoints.

---

## Design Decisions

### 1. Bulk Fetch + In-Memory Cache

**Decision:** Fetch all data on startup and cache in-memory, rather than querying APIs per-user request.

**Rationale:**
- **Low latency:** User requests hit in-memory DataFrames (~10-50ms) vs external API calls (~200-500ms)
- **Cost control:** Google Places API charges per call. Bulk fetch = predictable cost.
- **Hackathon reliability:** API failures during demo don't affect already-cached data.
- **Data freshness:** POI data rarely changes (24h stale acceptable). Weather refreshes hourly.

### 2. Grid-Based Place Search

**Decision:** Use a 3×3 geographic grid overlaying Munich, querying each grid point with all place types.

**Rationale:**
- Google Places Nearby Search returns max 20 results per query
- A single query at Munich center would miss venues at city edges
- 3×3 grid with 2.5km spacing + 5km radius provides overlapping coverage
- Total API calls: `3 × 3 × 8 place types = 72 calls` on startup
- After deduplication: ~160 unique merchants

### 3. Polars DataFrames

**Decision:** Use Polars instead of Pandas for in-memory storage.

**Rationale:**
- **Performance:** Polars is 10-100x faster for filtering operations
- **Memory efficient:** Arrow-based columnar format
- **Simple API:** Works well with FastAPI's sync endpoints
- **Small footprint:** ~160 rows easily fits in memory

### 4. Distance Calculation (Euclidean Approximation)

**Decision:** Use Euclidean distance approximation instead of Haversine for filtering.

**Rationale:**
- At Munich latitude (48°), the approximation error is ~1-2% for distances <5km
- Simpler implementation (avoid Polars trig function limitations)
- Performance benefit for large datasets
- Accuracy acceptable for "nearby merchants" use case

### 5. FastAPI Lifespan for Scheduled Updates

**Decision:** Use FastAPI's lifespan context manager with APScheduler.

**Rationale:**
- Clean startup/shutdown lifecycle
- Background scheduler runs independently of request handling
- Configurable intervals (weather: 1h, places: 24h by default)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              STARTUP SEQUENCE                                │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────┐
                              │   FastAPI app   │
                              │   (lifespan)    │
                              └────────┬────────┘
                                       │
                                       ▼
                    ┌──────────────────────────────────────┐
                    │         fetch_all(config)            │
                    │  - fetch_merchants(config)           │
                    │  - fetch_weather(config)            │
                    └──────────────────┬───────────────────┘
                                       │
                          ┌────────────┴────────────┐
                          ▼                         ▼
              ┌──────────────────┐      ┌──────────────────┐
              │  Google Places   │      │  Google Weather  │
              │  API (72 calls)   │      │  API (1 call)    │
              └────────┬─────────┘      └────────┬─────────┘
                       │                         │
                       ▼                         ▼
              ┌──────────────────┐      ┌──────────────────┐
              │ parse_places()   │      │ parse_weather()  │
              │ - deduplicate    │      │ - extract fields │
              │ - build Polars   │      │ - build Polars   │
              └────────┬─────────┘      └────────┬─────────┘
                       │                         │
                       └────────────┬────────────┘
                                    ▼
                         ┌────────────────────┐
                         │   In-Memory Store  │
                         │   (store_data.py)  │
                         │                    │
                         │  merchants_df      │
                         │  weather_df        │
                         │  last_fetch{}      │
                         └────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │     APScheduler (interval)    │
                    │ - refresh_places (24h)        │
                    │ - refresh_weather (1h)        │
                    └───────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              REQUEST FLOW                                    │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────┐
                    │   Client App    │
                    │  (User/Merchant)│
                    └────────┬────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │      FastAPI Endpoints       │
              │  GET /api/health             │
              │  GET /api/weather            │
              │  GET /api/merchants?lat&lon  │
              │  GET /api/context?lat&lon    │
              │  POST /api/admin/refresh     │
              └──────────────┬───────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │     store_data.py            │
              │  - merchants_df (Polars)     │
              │  - weather_df (Polars)       │
              │  - filter_merchants_by_distance│
              └──────────────┬───────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │  JSON Response │
                    └────────────────┘
```

---

## Module Overview

### `src/backend/config.py` (implied in `gather_data.py`)

**Purpose:** Configuration dataclass with API keys and location parameters.

**Key attributes:**
```python
@dataclass
class Config:
    google_api_key: str              # API key for Google Places/Weather
    munich_lat: float = 48.1351      # Munich city center
    munich_lon: float = 11.5820
    search_radius_m: int = 5000      # 5km radius per grid point
    place_types: list[str]           # Categories to fetch
    weather_interval_hours: int = 1
    places_interval_hours: int = 24
```

---

### `src/backend/gather_data.py`

**Purpose:** Google API clients for fetching merchant and weather data.

**Exports:**
| Function | Input | Output | Description |
|----------|-------|--------|-------------|
| `fetch_merchants(config)` | Config | `pl.DataFrame` | Fetches all POIs from 3×3 grid query |
| `fetch_weather(config)` | Config | `pl.DataFrame` | Fetches current weather for Munich |
| `fetch_all(config)` | Config | `tuple[DataFrame, DataFrame]` | Runs both in parallel |

**Internal functions:**
| Function | Description |
|----------|-------------|
| `_fetch_places_page()` | Single API call to Places Nearby Search |
| `_fetch_places_grid()` | Orchestrates 72 parallel API calls (3×3 grid × 8 types) |
| `_parse_places()` | Deduplicates and builds Polars DataFrame from raw API response |

**Grid search algorithm:**
```python
grid_size = 3  # 3×3 = 9 points
spacing_km = 2.5  # 2.5km between grid points
for i in range(3):
    for j in range(3):
        lat = center_lat + (i - 1) * spacing_deg
        lon = center_lon + (j - 1) * spacing_deg
        for place_type in PLACE_TYPES:
            await _fetch_places_page(client, config, lat, lon, place_type, radius)
```

---

### `src/backend/store_data.py`

**Purpose:** In-memory storage and query utilities.

**Global state:**
```python
merchants_df: pl.DataFrame | None   # Cached POI data
weather_df: pl.DataFrame | None     # Cached weather data
last_fetch: dict[str, datetime]    # Timestamp tracking
```

**DataFrames schemas:**

#### `merchants_df`
| Column | Type | Description |
|--------|------|-------------|
| `place_id` | `str` | Google Place ID |
| `name` | `str` | Display name |
| `lat` | `float64` | Latitude |
| `lon` | `float64` | Longitude |
| `types` | `list[str]` | Place types (e.g., "cafe", "restaurant") |
| `primary_type` | `str` | First type in list |
| `address` | `str` | Formatted address |
| `rating` | `float64` | Google rating (nullable) |
| `price_level` | `int` | 0-4 price tier, -1 if unknown |
| `last_updated` | `datetime` | Fetch timestamp |

#### `weather_df`
| Column | Type | Description |
|--------|------|-------------|
| `timestamp` | `datetime` | Fetch time |
| `temp_c` | `float64` | Temperature in Celsius |
| `feels_like_c` | `float64` | Feels-like temperature |
| `humidity` | `int` | Relative humidity % |
| `condition` | `str` | Weather type (CLEAR, RAIN, etc.) |
| `precipitation_mm` | `float64` | Precipitation amount |
| `wind_speed_kph` | `float64` | Wind speed |
| `cloud_cover` | `int` | Cloud cover % |
| `is_daytime` | `bool` | Day/night flag |

**Exports:**
| Function | Input | Output | Description |
|----------|-------|--------|-------------|
| `filter_merchants_by_distance(lat, lon, radius_km)` | lat, lon, radius | `DataFrame` | Filters merchants within radius |
| `get_merchants_count()` | - | `int` | Returns total cached count |
| `get_weather_age_minutes()` | - | `int` | Minutes since last weather fetch |
| `get_merchants_age_hours()` | - | `int` | Hours since last merchants fetch |

---

### `src/backend/api.py`

**Purpose:** FastAPI application with scheduled refresh and REST endpoints.

**Lifespan flow:**
```
startup → fetch_all() → populate store → start scheduler → serve requests
shutdown → stop scheduler
```

**Endpoints:**

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/api/health` | Status check | `{status, merchants_count, weather_age_minutes, ...}` |
| `GET` | `/api/weather` | Current weather in Munich | `{temp_c, condition, humidity, ...}` |
| `GET` | `/api/merchants?lat&lon&radius_km&category` | Merchants within radius | `{count, merchants: [...]}` |
| `GET` | `/api/context?lat&lon&radius_km` | Weather + nearby merchants (for offer engine) | `{weather, merchants, merchants_count}` |
| `POST` | `/api/admin/refresh` | Manual data refresh | `{status, merchants_count}` |

**Query parameters:**
- `lat` (required): Latitude for center point
- `lon` (required): Longitude for center point
- `radius_km` (default: 1.0): Search radius in kilometers
- `category` (optional): Filter by place type (e.g., "cafe", "restaurant")

---

## Call Order

### Startup Sequence

```
1. uvicorn src.backend.api:app
   │
   ├── lifespan() context manager starts
   │   │
   │   ├── refresh_merchants()
   │   │   │
   │   │   ├── fetch_merchants(config)
   │   │   │   ├── asyncio.gather(_fetch_places_grid(...))
   │   │   │   │   └── 72 parallel API calls to Google Places
   │   │   │   └── _parse_places(raw_data)
   │   │   │
   │   │   └── store_data.merchants_df = result
   │   │
   │   ├── refresh_weather()
   │   │   │
   │   │   ├── fetch_weather(config)
   │   │   │   └── single API call to Google Weather
   │   │   │
   │   │   └── store_data.weather_df = result
   │   │
   │   ├── scheduler.add_job(refresh_weather, interval=1h)
   │   ├── scheduler.add_job(refresh_merchants, interval=24h)
   │   └── scheduler.start()
   │
   └── yield (app runs, serving requests)
```

### Request Flow (GET /api/context)

```
Client Request: GET /api/context?lat=48.135&lon=11.58&radius_km=1.0
   │
   └── FastAPI route handler (get_context)
       │
       ├── store_data.filter_merchants_by_distance(48.135, 11.58, 1.0)
       │   │
       │   ├── Load store_data.merchants_df
       │   ├── Calculate distance_km for each row
       │   └── Filter rows where distance_km <= 1.0
       │
       ├── Load store_data.weather_df
       │
       └── Return JSON: {weather: {...}, merchants: [...]}
```

### Scheduled Refresh (background)

```
APScheduler (asyncio)
   │
   ├── Every 1 hour:
   │   └── refresh_weather()
   │       └── fetch_weather(config) → store_data.weather_df = result
   │
   └── Every 24 hours:
       └── refresh_merchants()
           └── fetch_merchants(config) → store_data.merchants_df = result
```

---

---

## Future: Offer Generation Pipeline

This data layer is designed as the foundation for a hyperpersonalized offer system. The following chapter outlines how it integrates with the offer generation workflow and what remains to be implemented.

### Context Layer Role in Offer Generation

The `/api/context` endpoint provides the real-time signals needed for AI-powered offer generation:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OFFER GENERATION FLOW                                │
└─────────────────────────────────────────────────────────────────────────────┘

                         ┌──────────────────────┐
                         │   On-Device SLM     │
                         │  (User Smartphone)  │
                         │                      │
                         │ - Location (lat/lon) │
                         │ - Movement pattern  │
                         │ - Preference signals│
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │   Intent Abstraction  │
                         │                      │
                         │ "browsing" /         │
                         │ "commuting" /        │
                         │ "exploring"          │
                         └──────────┬───────────┘
                                    │
                                    │ HTTP Request
                                    ▼
              ┌──────────────────────────────────────────┐
              │            /api/context                    │
              │  GET /api/context?lat=48.135&lon=11.58    │
              │                                           │
              │  Returns:                                 │
              │  - weather: {temp_c, condition, ...}     │
              │  - merchants: [{name, distance_km, ...}]  │
              │  - merchants_count: N                     │
              └────────────────────┬─────────────────────┘
                                   │
                                   ▼
              ┌──────────────────────────────────────────┐
              │            Context Aggregation            │
              │                                           │
              │  Combine:                                 │
              │  - User intent (from on-device)          │
              │  - Weather condition (raining? cold?)    │
              │  - Nearby merchants (within radius)      │
              │  - Merchant types (cafe vs restaurant)   │
              │  - Transaction density (future: quiet hours)
              └────────────────────┬─────────────────────┘
                                   │
                                   ▼
              ┌──────────────────────────────────────────┐
              │         Rule Engine / Merchant Goals      │
              │                                           │
              │  Merchant rules example:                  │
              │  - max_discount: 20%                      │
              │  - quiet_threshold: 5 txns/hour          │
              │  - target_types: ["cafe", "drink"]       │
              │  - daily_offer_limit: 50                 │
              │                                           │
              │  Filter merchants by:                     │
              │  - Matching offer goals                    │
              │  - Quiet hour detection                   │
              │  - Budget remaining                       │
              └────────────────────┬─────────────────────┘
                                   │
                                   ▼
              ┌──────────────────────────────────────────┐
              │         Generative Offer Engine           │
              │                                           │
              │  Input:                                   │
              │  - Merchant: "Café Müller"                │
              │  - Context: {raining=True, temp=10°C}   │
              │  - Distance: 80m                         │
              │  - Rule: max 15% discount, quiet hour    │
              │                                           │
              │  Output:                                 │
              │  - headline: "Cold outside? Warm up..."  │
              │  - discount: 15%                          │
              │  - valid_minutes: 18                     │
              │  - emotion: "cozy, warm"                  │
              └────────────────────┬─────────────────────┘
                                   │
                                   ▼
              ┌──────────────────────────────────────────┐
              │              Offer Delivery               │
              │                                           │
              │  - Push notification on device            │
              │  - Display in wallet app                  │
              │  - QR code generation for redemption      │
              └──────────────────────────────────────────┘
```

### What's Implemented (Data Layer)

| Component | Status | Description |
|-----------|--------|-------------|
| `/api/weather` | ✅ Done | Current weather for Munich |
| `/api/merchants` | ✅ Done | Nearby merchants with distance filtering |
| `/api/context` | ✅ Done | Combined weather + merchant context |
| `/api/health` | ✅ Done | System status |
| Periodic refresh | ✅ Done | Weather (1h), Merchants (24h) |
| Distance calculation | ✅ Done | Filter by radius from user location |

### What's Needed (Offer System)

| Component | Priority | Description |
|-----------|----------|-------------|
| **1. Transaction Simulation** | High | Simulated Payone transaction density per merchant (`transactions_df`) |
| **2. Merchant Rules Store** | High | Per-merchant offer parameters (max discount, quiet threshold, daily limit) |
| **3. Offer Generation Endpoint** | High | `POST /api/offers/generate` combining context + rules |
| **4. Offer State Management** | High | Track generated offers: `pending`, `accepted`, `declined`, `redeemed` |
| **5. Redemption Flow** | Medium | QR code generation, validation, cashback calculation |
| **6. Merchant Dashboard** | Medium | View offer performance, accept/decline rates, cashback issued |

---

## Implementation Roadmap

### Phase 1: Transaction Simulation

**Goal:** Add simulated transaction data to enable "quiet hour" detection.

**Data structure:**
```python
# src/backend/store_data.py

transactions_df: pl.DataFrame | None  # Schema:
# | merchant_id | hour | day_of_week | txn_count | avg_basket | is_quiet |
# |-------------|------|-------------|------------|-------------|----------|
# | m001        | 12   | Tuesday     | 3          | 15.50      | True     |
# | m001        | 18   | Tuesday     | 25         | 22.00      | False    |
```

**Generation algorithm:**
```python
def generate_transactions(merchants_df: pl.DataFrame) -> pl.DataFrame:
    """Generate realistic transaction patterns for each merchant."""
    for merchant in merchants_df:
        for hour in range(24):
            for day in ["Monday", "Tuesday", ...]:
                # Apply category-specific patterns:
                # - Cafes: peak 8-10am, 2-4pm; quiet 11am-1pm
                # - Restaurants: peak 12-2pm, 6-9pm; quiet 3-5pm
                # - Bars: peak 8pm-1am; quiet mornings
                baseline = get_baseline(merchant.primary_type, hour, day)
                txn_count = baseline * random.uniform(0.7, 1.3)
                is_quiet = txn_count < baseline * 0.5
```

**New endpoint:**
```python
@app.get("/api/transactions/{merchant_id}")
def get_transactions(merchant_id: str, day: str, hour: int):
    """Return transaction density for a merchant at specific time."""
```

---

### Phase 2: Merchant Rules Store

**Goal:** Allow merchants to configure offer parameters.

**Data structure:**
```python
# src/backend/store_data.py

merchant_rules: dict[str, dict] = {}  # merchant_id -> rules
# Example:
# {
#   "ChIJdRuwa4t1nkcRP4FWNEs1efI": {
#       "max_discount_pct": 20,
#       "quiet_threshold": 5,
#       "target_categories": ["cafe", "drink"],
#       "daily_offer_limit": 50,
#       "active": True
#   }
# }
```

**Endpoints:**
```python
@app.get("/api/merchants/{merchant_id}/rules")
def get_merchant_rules(merchant_id: str):
    """Get merchant's offer generation rules."""

@app.put("/api/merchants/{merchant_id}/rules")
def update_merchant_rules(merchant_id: str, rules: RulesPayload):
    """Update merchant's offer rules."""
```

---

### Phase 3: Offer Generation Endpoint

**Goal:** Generate context-aware offers from combined signals.

**New endpoint:**
```python
@app.post("/api/offers/generate")
async def generate_offer(payload: OfferRequest):
    """
    Input:
        - user_lat, user_lon
        - intent: "browsing" | "commuting" | "exploring"
        - preferences: ["cafe", "restaurant", ...]
    
    Process:
        1. Get context (weather + nearby merchants)
        2. Filter merchants by:
           - Distance < threshold
           - Matching user preferences
           - Currently quiet (from transactions_df)
           - Active rules
        3. Rank by relevance score:
           - distance_score = 1 / (distance_km + 0.1)
           - quiet_score = is_quiet ? 1.0 : 0.3
           - weather_match = weather_condition matches offer_type
        4. Generate offer text (template or SLM)
        5. Store offer in offers_df
        6. Return offer details
    
    Output:
        - offer_id
        - merchant: {name, distance_m}
        - headline: str
        - discount: str
        - reason: str
        - valid_minutes: int
    """
```

---

### Phase 4: Offer State Management

**Goal:** Track offer lifecycle from generation to redemption.

**Data structure:**
```python
offers_df: pl.DataFrame | None  # Schema:
# | offer_id | merchant_id | user_id | generated_at | discount_pct | 
# | headline | status | expires_at | redeemed_at |
```

**Status flow:**
```
generated → pending → accepted → redeemed
                   ↘ declined
```

**Endpoints:**
```python
@app.post("/api/offers/{offer_id}/claim")
def claim_offer(offer_id: str, user_id: str):
    """User claims offer, generates QR token."""

@app.post("/api/offers/{offer_id}/redeem")
def redeem_offer(offer_id: str, qr_token: str):
    """Merchant scans QR, validates, issues cashback."""

@app.post("/api/offers/{offer_id}/dismiss")
def dismiss_offer(offer_id: str, reason: str | None):
    """User declines, log for ML feedback."""
```

---

### Phase 5: Merchant Dashboard

**Goal:** Show merchants offer performance.

**Endpoints:**
```python
@app.get("/api/merchant/{merchant_id}/stats")
def get_merchant_stats(merchant_id: str):
    """
    Returns:
        - offers_sent_today: int
        - accept_rate: float
        - cashback_issued: float
        - top_offer_types: list[str]
    """

@app.get("/api/merchant/{merchant_id}/offers")
def get_offer_feed(merchant_id: str, limit: int = 10):
    """Recent offers for merchant dashboard."""
```

---

### Integration Example

**Full flow from user walking near a café:**

```
1. User device detects: lat=48.135, lon=11.580, intent="browsing"
   │
   ▼
2. Device calls: GET /api/context?lat=48.135&lon=11.580&radius_km=1
   │
   ▼
3. Server returns:
   {
     "weather": {"temp_c": 10, "condition": "RAIN"},
     "merchants": [
       {"name": "Café Müller", "distance_km": 0.08, "primary_type": "cafe", ...},
       ...26 more
     ]
   }
   │
   ▼
4. Client combines with on-device intent → calls:
   POST /api/offers/generate
   {
     "user_lat": 48.135,
     "user_lon": 11.580,
     "intent": "browsing",
     "preferences": ["cafe", "bakery"]
   }
   │
   ▼
5. Server:
   a. Filters merchants by preferences + distance
   b. Checks transaction data for quiet hours
   c. Matches weather (RAIN → good for hot drinks)
   d. Applies merchant rules (Café Müller: max 20% discount)
   e. Generates offer:
      "Cold and raining outside? Your hot cappuccino is waiting."
      15% off, valid 18 minutes
   f. Stores offer in offers_df
   │
   ▼
6. User sees offer in wallet app
   - Accepts → QR code generated
   - Redeems at café → cashback credited
```

---

## Configuration

Default values in `gather_data.Config`:

| Parameter | Default | Environment Variable |
|-----------|---------|---------------------|
| `google_api_key` | required | `GOOGLE_PLACES_WEATHER_API_KEY` or `GOOGLE_API_KEY` or `GEMINI_API_KEY` |
| `munich_lat` | 48.1351 | - |
| `munich_lon` | 11.5820 | - |
| `search_radius_m` | 5000 | - |
| `place_types` | `["cafe", "restaurant", "bar", "night_club", "bakery", "meal_takeaway", "meal_delivery", "food"]` | - |
| `weather_interval_hours` | 1 | - |
| `places_interval_hours` | 24 | - |

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| API rate limit (Places) | Log error, return empty DataFrame |
| Weather API failure | Log error, raise RuntimeError (startup fails fast) |
| No merchants in radius | Return empty array (frontend handles) |
| Missing weather data | Return 503 Service Unavailable |
| Invalid query params | FastAPI returns 422 Validation Error |

---

## Performance Characteristics

| Metric | Value |
|--------|-------|
| Startup time | ~2-3 seconds (72 Places API calls in parallel) |
| Memory footprint | ~1-2 MB (160 merchants + 1 weather row) |
| Request latency | ~10-50ms (in-memory DataFrame operations) |
| API calls per startup | 73 (72 Places + 1 Weather) |
| API calls per hour (ongoing) | 1 (Weather refresh) |
| API calls per day (ongoing) | 73 (Weather hourly + Places daily) |

---

## Future Extensions

1. **Caching to disk:** Save DataFrames to Parquet on shutdown, load on startup to avoid API calls during development
2. **Transaction simulation:** Add `transactions_df` for simulated Payone data (quiet hour detection)
3. **User context:** Add `user_context_df` for on-device intent signals
4. **Offer engine:** Add `/api/offers/generate` endpoint that combines context + merchant rules
5. **Multi-city support:** Add city parameter, store multiple grids