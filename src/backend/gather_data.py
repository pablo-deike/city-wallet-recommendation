from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import httpx
import polars as pl

from src.backend.config import PLACE_TYPES, ApiConfig, Filepaths, GridConfig

PLACES_API_URL = "https://places.googleapis.com/v1/places:searchNearby"
WEATHER_API_URL = "https://weather.googleapis.com/v1/currentConditions:lookup"

PLACES_FIELD_MASK = "places.id,places.displayName,places.location,places.types,places.formattedAddress,places.rating,places.priceLevel"


@dataclass
class Config:
    google_api_key: str
    munich_lat: float = 48.1351
    munich_lon: float = 11.5820
    search_radius_m: int = 5000
    place_types: list[str] = field(default_factory=lambda: PLACE_TYPES)
    api_config: ApiConfig = field(default_factory=ApiConfig)
    grid_config: GridConfig = field(default_factory=GridConfig)

    @property
    def weather_interval_hours(self) -> int:
        return self.api_config.weather_interval_hours

    @property
    def places_interval_hours(self) -> int:
        return self.api_config.places_interval_hours

    @classmethod
    def from_env(cls) -> "Config":
        api_key = os.getenv("GOOGLE_PLACES_WEATHER_API_KEY") or os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_PLACES_WEATHER_API_KEY, GOOGLE_API_KEY, or GEMINI_API_KEY not set in environment")
        return cls(google_api_key=api_key)


def _ensure_data_dir() -> Path:
    Filepaths.GOOGLE_DATA.mkdir(parents=True, exist_ok=True)
    return Filepaths.GOOGLE_DATA


def save_to_parquet(merchants_df: pl.DataFrame, weather_df: pl.DataFrame) -> tuple[Path, Path]:
    data_dir = _ensure_data_dir()

    merchants_path = data_dir / "merchants.parquet"
    weather_path = data_dir / "weather.parquet"

    merchants_df.write_parquet(merchants_path)
    weather_df.write_parquet(weather_path)

    return merchants_path, weather_path


def load_from_parquet() -> tuple[pl.DataFrame | None, pl.DataFrame | None]:
    merchants_path = Filepaths.GOOGLE_DATA / "merchants.parquet"
    weather_path = Filepaths.GOOGLE_DATA / "weather.parquet"

    merchants_df = None
    weather_df = None

    if merchants_path.exists():
        merchants_df = pl.read_parquet(merchants_path)

    if weather_path.exists():
        weather_df = pl.read_parquet(weather_path)

    return merchants_df, weather_df


async def _fetch_places_page(
    client: httpx.AsyncClient,
    config: Config,
    lat: float,
    lon: float,
    place_type: str,
    radius_m: int,
) -> list[dict]:
    headers = {
        "X-Goog-Api-Key": config.google_api_key,
        "X-Goog-FieldMask": PLACES_FIELD_MASK,
        "Content-Type": "application/json",
    }
    body = {
        "includedTypes": [place_type],
        "maxResultCount": 20,
        "locationRestriction": {
            "circle": {
                "center": {"latitude": lat, "longitude": lon},
                "radius": radius_m,
            }
        },
    }
    resp = await client.post(PLACES_API_URL, headers=headers, json=body)
    if resp.status_code != 200:
        return []
    data = resp.json()
    return data.get("places", [])


async def _fetch_places_grid(
    client: httpx.AsyncClient,
    config: Config,
    center_lat: float,
    center_lon: float,
) -> list[dict]:
    all_places = []
    grid_size = config.grid_config.grid_size
    spacing_km = config.grid_config.spacing_km

    spacing_deg = spacing_km / 111.0
    half_grid = (grid_size - 1) / 2

    tasks = []
    for i in range(grid_size):
        for j in range(grid_size):
            lat = center_lat + (i - half_grid) * spacing_deg
            lon = center_lon + (j - half_grid) * spacing_deg
            for place_type in config.place_types:
                tasks.append(_fetch_places_page(client, config, lat, lon, place_type, config.search_radius_m))

    print(f"Fetching places: {grid_size}x{grid_size} grid, {len(config.place_types)} types = {len(tasks)} API calls")

    results = await asyncio.gather(*tasks)
    for places in results:
        all_places.extend(places)

    return all_places


def _parse_places(places: list[dict]) -> pl.DataFrame:
    if not places:
        return pl.DataFrame(
            schema={
                "place_id": pl.String,
                "name": pl.String,
                "lat": pl.Float64,
                "lon": pl.Float64,
                "types": pl.List(pl.String),
                "primary_type": pl.String,
                "address": pl.String,
                "rating": pl.Float64,
                "price_level": pl.Int64,
                "last_updated": pl.Datetime,
            }
        )

    PRICE_LEVELS = {
        "PRICE_LEVEL_FREE": 0,
        "PRICE_LEVEL_INEXPENSIVE": 1,
        "PRICE_LEVEL_MODERATE": 2,
        "PRICE_LEVEL_EXPENSIVE": 3,
        "PRICE_LEVEL_VERY_EXPENSIVE": 4,
    }

    rows = []
    seen_ids = set()
    for place in places:
        place_id = place.get("id", "")
        if place_id in seen_ids:
            continue
        seen_ids.add(place_id)

        location = place.get("location", {})
        types = place.get("types", [])
        price_str = place.get("priceLevel", "")

        rows.append(
            {
                "place_id": place_id,
                "name": place.get("displayName", {}).get("text", ""),
                "lat": location.get("latitude", 0.0),
                "lon": location.get("longitude", 0.0),
                "types": types,
                "primary_type": types[0] if types else "",
                "address": place.get("formattedAddress", ""),
                "rating": place.get("rating"),
                "price_level": PRICE_LEVELS.get(price_str, -1),
                "last_updated": datetime.now(),
            }
        )

    return pl.DataFrame(rows)


async def fetch_merchants(config: Config) -> pl.DataFrame:
    async with httpx.AsyncClient(timeout=30.0) as client:
        places = await _fetch_places_grid(
            client,
            config,
            config.munich_lat,
            config.munich_lon,
        )
    return _parse_places(places)


async def fetch_weather(config: Config) -> pl.DataFrame:
    async with httpx.AsyncClient(timeout=30.0) as client:
        params = {
            "key": config.google_api_key,
            "location.latitude": config.munich_lat,
            "location.longitude": config.munich_lon,
        }
        resp = await client.get(WEATHER_API_URL, params=params)
        if resp.status_code != 200:
            raise RuntimeError(f"Weather API failed: {resp.status_code} - {resp.text}")

        data = resp.json()

    row = {
        "timestamp": datetime.now(),
        "temp_c": data.get("temperature", {}).get("degrees", 0.0),
        "feels_like_c": data.get("feelsLikeTemperature", {}).get("degrees", 0.0),
        "humidity": data.get("relativeHumidity", 0),
        "condition": data.get("weatherCondition", {}).get("type", "UNKNOWN"),
        "precipitation_mm": data.get("precipitation", {}).get("qpf", {}).get("quantity", 0.0),
        "wind_speed_kph": data.get("wind", {}).get("speed", {}).get("value", 0.0),
        "cloud_cover": data.get("cloudCover", 0),
        "is_daytime": data.get("isDaytime", True),
    }

    return pl.DataFrame([row])


async def fetch_all(config: Config) -> tuple[pl.DataFrame, pl.DataFrame]:
    merchants, weather = await asyncio.gather(
        fetch_merchants(config),
        fetch_weather(config),
    )

    save_to_parquet(merchants, weather)

    return merchants, weather
