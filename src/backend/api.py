from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime

import polars as pl
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from src.backend import db, gather_data

load_dotenv()

scheduler = AsyncIOScheduler()

config = gather_data.Config.from_env()


async def refresh_merchants(force: bool = False) -> None:
    try:
        if not force:
            cached = db.load_merchants()
            if cached is not None and len(cached) > 0:
                print(f"[{datetime.now()}] Loaded merchants from DB: {len(cached)} places")
                return

        merchants_df = await gather_data.fetch_merchants(config)
        db.save_merchants(merchants_df)
        print(f"[{datetime.now()}] Refreshed merchants from API: {len(merchants_df)} places")
    except Exception as e:
        print(f"[{datetime.now()}] Failed to refresh merchants: {e}")


async def refresh_weather(force: bool = False) -> None:
    try:
        if not force:
            cached = db.load_weather()
            if cached is not None and len(cached) > 0:
                age_minutes = db.get_weather_age_minutes()
                if age_minutes is not None and age_minutes < 60:
                    print(f"[{datetime.now()}] Loaded weather from DB (age: {age_minutes} min)")
                    return

        weather_df = await gather_data.fetch_weather(config)
        db.save_weather(weather_df)
        print(f"[{datetime.now()}] Refreshed weather from API")
    except Exception as e:
        print(f"[{datetime.now()}] Failed to refresh weather: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI) -> None:
    db.init_db()

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
    grid_size: int
    spacing_km: float
    db_path: str


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        merchants_count=db.get_merchants_count(),
        weather_age_minutes=db.get_weather_age_minutes(),
        merchants_age_hours=db.get_merchants_age_hours(),
        grid_size=config.grid_config.grid_size,
        spacing_km=config.grid_config.spacing_km,
        db_path=str(db._get_db_path()),
    )


@app.get("/api/weather", response_model=WeatherResponse)
def get_weather() -> WeatherResponse:
    weather_df = db.load_weather()
    if weather_df is None or len(weather_df) == 0:
        raise HTTPException(status_code=503, detail="Weather data not available")

    row = weather_df.row(0, named=True)
    return WeatherResponse(
        timestamp=row["timestamp"].isoformat() if not isinstance(row["timestamp"], str) else row["timestamp"],
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
def get_merchants(lat: float, lon: float, radius_km: float = 1.0, category: str | None = None) -> MerchantsResponse:
    df = db.filter_merchants_by_distance(lat, lon, radius_km)

    if category:
        df = df.filter(pl.col("types").list.contains(category))

    merchants = df.to_dicts()

    return MerchantsResponse(
        count=len(merchants),
        merchants=merchants,
    )


@app.get("/api/context", response_model=ContextResponse)
def get_context(lat: float, lon: float, radius_km: float = 1.0) -> ContextResponse:
    merchants_df = db.filter_merchants_by_distance(lat, lon, radius_km)
    merchants = merchants_df.to_dicts()

    weather = None
    weather_df = db.load_weather()
    if weather_df is not None and len(weather_df) > 0:
        row = weather_df.row(0, named=True)
        weather = WeatherResponse(
            timestamp=row["timestamp"].isoformat() if not isinstance(row["timestamp"], str) else row["timestamp"],
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
async def manual_refresh(force: bool = True) -> dict[str, str | int]:
    await refresh_merchants(force=force)
    await refresh_weather(force=force)
    return {
        "status": "refreshed",
        "merchants_count": db.get_merchants_count(),
        "db_path": str(db._get_db_path()),
    }