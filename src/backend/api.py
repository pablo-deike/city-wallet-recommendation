from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime

import polars as pl
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from src.backend import gather_data, store_data

load_dotenv()

scheduler = AsyncIOScheduler()


class ConfigModel(BaseModel):
    weather_interval_hours: int = 1
    places_interval_hours: int = 24


config = gather_data.Config.from_env()
api_config = ConfigModel()


async def refresh_merchants():
    try:
        store_data.merchants_df = await gather_data.fetch_merchants(config)
        store_data.last_fetch["merchants"] = datetime.now()
        print(f"[{datetime.now()}] Refreshed merchants: {len(store_data.merchants_df)} places")
    except Exception as e:
        print(f"[{datetime.now()}] Failed to refresh merchants: {e}")


async def refresh_weather():
    try:
        store_data.weather_df = await gather_data.fetch_weather(config)
        store_data.last_fetch["weather"] = datetime.now()
        print(f"[{datetime.now()}] Refreshed weather")
    except Exception as e:
        print(f"[{datetime.now()}] Failed to refresh weather: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await refresh_merchants()
    await refresh_weather()
    
    scheduler.add_job(refresh_weather, "interval", hours=config.weather_interval_hours)
    scheduler.add_job(refresh_merchants, "interval", hours=config.places_interval_hours)
    scheduler.start()
    
    yield
    
    scheduler.shutdown()


app = FastAPI(title="City Wallet Data API", lifespan=lifespan)


class MerchantsResponse(BaseModel):
    count: int
    merchants: list[dict]


class WeatherResponse(BaseModel):
    timestamp: str
    temp_c: float
    feels_like_c: float
    humidity: int
    condition: str
    precipitation_mm: float
    wind_speed_kph: float
    cloud_cover: int
    is_daytime: bool


class ContextResponse(BaseModel):
    weather: WeatherResponse | None
    merchants: list[dict]
    merchants_count: int


class HealthResponse(BaseModel):
    status: str
    merchants_count: int
    weather_age_minutes: int | None
    merchants_age_hours: int | None
    last_merchants_fetch: str | None
    last_weather_fetch: str | None


@app.get("/api/health", response_model=HealthResponse)
def health():
    return HealthResponse(
        status="ok",
        merchants_count=store_data.get_merchants_count(),
        weather_age_minutes=store_data.get_weather_age_minutes(),
        merchants_age_hours=store_data.get_merchants_age_hours(),
        last_merchants_fetch=store_data.last_fetch.get("merchants", "").isoformat() if store_data.last_fetch.get("merchants") else None,
        last_weather_fetch=store_data.last_fetch.get("weather", "").isoformat() if store_data.last_fetch.get("weather") else None,
    )


@app.get("/api/weather", response_model=WeatherResponse)
def get_weather():
    if store_data.weather_df is None or len(store_data.weather_df) == 0:
        raise HTTPException(status_code=503, detail="Weather data not available")
    
    row = store_data.weather_df.row(0, named=True)
    return WeatherResponse(
        timestamp=row["timestamp"].isoformat(),
        temp_c=row["temp_c"],
        feels_like_c=row["feels_like_c"],
        humidity=row["humidity"],
        condition=row["condition"],
        precipitation_mm=row["precipitation_mm"],
        wind_speed_kph=row["wind_speed_kph"],
        cloud_cover=row["cloud_cover"],
        is_daytime=row["is_daytime"],
    )


@app.get("/api/merchants", response_model=MerchantsResponse)
def get_merchants(lat: float, lon: float, radius_km: float = 1.0, category: str | None = None):
    df = store_data.filter_merchants_by_distance(lat, lon, radius_km)
    
    if category:
        df = df.filter(pl.col("types").list.contains(category))
    
    merchants = df.to_dicts()
    
    return MerchantsResponse(
        count=len(merchants),
        merchants=merchants,
    )


@app.get("/api/context", response_model=ContextResponse)
def get_context(lat: float, lon: float, radius_km: float = 1.0):
    merchants_df = store_data.filter_merchants_by_distance(lat, lon, radius_km)
    merchants = merchants_df.to_dicts()
    
    weather = None
    if store_data.weather_df is not None and len(store_data.weather_df) > 0:
        row = store_data.weather_df.row(0, named=True)
        weather = WeatherResponse(
            timestamp=row["timestamp"].isoformat(),
            temp_c=row["temp_c"],
            feels_like_c=row["feels_like_c"],
            humidity=row["humidity"],
            condition=row["condition"],
            precipitation_mm=row["precipitation_mm"],
            wind_speed_kph=row["wind_speed_kph"],
            cloud_cover=row["cloud_cover"],
            is_daytime=row["is_daytime"],
        )
    
    return ContextResponse(
        weather=weather,
        merchants=merchants,
        merchants_count=len(merchants),
    )


@app.post("/api/admin/refresh")
async def manual_refresh():
    await refresh_merchants()
    await refresh_weather()
    return {"status": "refreshed", "merchants_count": store_data.get_merchants_count()}
