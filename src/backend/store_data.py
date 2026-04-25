from __future__ import annotations

import math
from datetime import datetime

import polars as pl

merchants_df: pl.DataFrame | None = None
weather_df: pl.DataFrame | None = None
last_fetch: dict[str, datetime] = {}

MERCHANTS_SCHEMA = {
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

WEATHER_SCHEMA = {
    "timestamp": pl.Datetime,
    "temp_c": pl.Float64,
    "feels_like_c": pl.Float64,
    "humidity": pl.Int64,
    "condition": pl.String,
    "precipitation_mm": pl.Float64,
    "wind_speed_kph": pl.Float64,
    "cloud_cover": pl.Int64,
    "is_daytime": pl.Boolean,
}


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def filter_merchants_by_distance(lat: float, lon: float, radius_km: float) -> pl.DataFrame:
    if merchants_df is None:
        return pl.DataFrame(schema=MERCHANTS_SCHEMA)
    
    # Approximate 1 degree ≈ 111 km for both lat/lon at Munich latitude
    R = 6371.0
    km_per_degree = R * 3.141592653589793 / 180.0
    
    dlat = pl.col("lat") - lat
    dlon = pl.col("lon") - lon
    
    # Approximate distance (good for small distances)
    distance_km = (km_per_degree * (dlat ** 2 + dlon ** 2).sqrt()).alias("distance_km")
    
    df = merchants_df.with_columns(distance_km)
    return df.filter(pl.col("distance_km") <= radius_km)


def get_merchants_count() -> int:
    return len(merchants_df) if merchants_df is not None else 0


def get_weather_age_minutes() -> int | None:
    if "weather" not in last_fetch:
        return None
    return int((datetime.now() - last_fetch["weather"]).total_seconds() / 60)


def get_merchants_age_hours() -> int | None:
    if "merchants" not in last_fetch:
        return None
    return int((datetime.now() - last_fetch["merchants"]).total_seconds() / 3600)