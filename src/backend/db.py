from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path

import polars as pl

_DB_PATH: Path | None = None

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


def init_db(db_path: Path | str | None = None) -> Path:
    global _DB_PATH
    if db_path is not None:
        _DB_PATH = Path(db_path)
    elif _DB_PATH is None:
        from src.backend.config import Filepaths

        _DB_PATH = Filepaths.GOOGLE_DATA / "city_wallet.db"

    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    con = sqlite3.connect(str(_DB_PATH))
    cur = con.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS merchants (
            place_id TEXT PRIMARY KEY,
            name TEXT,
            lat REAL,
            lon REAL,
            types_json TEXT,
            primary_type TEXT,
            address TEXT,
            rating REAL,
            price_level INTEGER,
            last_updated TEXT
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS weather (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            temp_c REAL,
            feels_like_c REAL,
            humidity INTEGER,
            condition TEXT,
            precipitation_mm REAL,
            wind_speed_kph REAL,
            cloud_cover INTEGER,
            is_daytime INTEGER
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_merchants_lat_lon ON merchants(lat, lon)")
    con.commit()
    con.close()
    return _DB_PATH


def _get_db_path() -> Path:
    if _DB_PATH is None:
        init_db()
    assert _DB_PATH is not None
    return _DB_PATH


def _row_to_merchant(row: tuple) -> dict:
    last_updated = row[9]
    if isinstance(last_updated, str):
        last_updated = datetime.fromisoformat(last_updated)
    return {
        "place_id": row[0],
        "name": row[1],
        "lat": row[2],
        "lon": row[3],
        "types": json.loads(row[4]),
        "primary_type": row[5],
        "address": row[6],
        "rating": row[7],
        "price_level": row[8],
        "last_updated": last_updated,
    }


def _row_to_weather(row: tuple) -> dict:
    ts = row[1]
    if isinstance(ts, str):
        ts = datetime.fromisoformat(ts)
    return {
        "timestamp": ts,
        "temp_c": row[2],
        "feels_like_c": row[3],
        "humidity": row[4],
        "condition": row[5],
        "precipitation_mm": row[6],
        "wind_speed_kph": row[7],
        "cloud_cover": row[8],
        "is_daytime": bool(row[9]),
    }


def save_merchants(df: pl.DataFrame) -> None:
    db_path = _get_db_path()
    con = sqlite3.connect(str(db_path))
    cur = con.cursor()
    cur.execute("DELETE FROM merchants")
    rows = df.to_dicts()
    for r in rows:
        types_json = json.dumps(r["types"]) if isinstance(r["types"], list) else "[]"
        last_updated = r["last_updated"]
        if isinstance(last_updated, datetime):
            last_updated = last_updated.isoformat()
        cur.execute(
            "INSERT INTO merchants "
            "(place_id, name, lat, lon, types_json, primary_type, address, rating, price_level, last_updated) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                r["place_id"], r["name"], r["lat"], r["lon"],
                types_json, r["primary_type"], r["address"],
                r["rating"], r["price_level"], last_updated,
            ),
        )
    con.commit()
    con.close()


def save_weather(df: pl.DataFrame) -> None:
    db_path = _get_db_path()
    con = sqlite3.connect(str(db_path))
    cur = con.cursor()
    cur.execute("DELETE FROM weather")
    rows = df.to_dicts()
    for r in rows:
        ts = r["timestamp"]
        if isinstance(ts, datetime):
            ts = ts.isoformat()
        cur.execute(
            "INSERT INTO weather "
            "(timestamp, temp_c, feels_like_c, humidity, condition, precipitation_mm, wind_speed_kph, cloud_cover, is_daytime) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                ts, r["temp_c"], r["feels_like_c"], r["humidity"],
                r["condition"], r["precipitation_mm"],
                r["wind_speed_kph"], r["cloud_cover"], int(r["is_daytime"]),
            ),
        )
    con.commit()
    con.close()


def load_merchants() -> pl.DataFrame | None:
    db_path = _get_db_path()
    con = sqlite3.connect(str(db_path))
    cur = con.cursor()
    cur.execute("SELECT COUNT(*) FROM merchants")
    count = cur.fetchone()[0]
    if count == 0:
        con.close()
        return None
    cur.execute("SELECT place_id, name, lat, lon, types_json, primary_type, address, rating, price_level, last_updated FROM merchants")
    rows = cur.fetchall()
    con.close()
    records = [_row_to_merchant(r) for r in rows]
    return pl.DataFrame(records, schema=MERCHANTS_SCHEMA)


def load_weather() -> pl.DataFrame | None:
    db_path = _get_db_path()
    con = sqlite3.connect(str(db_path))
    cur = con.cursor()
    cur.execute("SELECT COUNT(*) FROM weather")
    count = cur.fetchone()[0]
    if count == 0:
        con.close()
        return None
    cur.execute(
        "SELECT id, timestamp, temp_c, feels_like_c, humidity, condition, "
        "precipitation_mm, wind_speed_kph, cloud_cover, is_daytime "
        "FROM weather ORDER BY id DESC LIMIT 1"
    )
    row = cur.fetchone()
    con.close()
    if row is None:
        return None
    return pl.DataFrame([_row_to_weather(row)], schema=WEATHER_SCHEMA)


def filter_merchants_by_distance(lat: float, lon: float, radius_km: float) -> pl.DataFrame:
    db_path = _get_db_path()
    con = sqlite3.connect(str(db_path))
    cur = con.cursor()
    km_per_degree = 6371.0 * 3.141592653589793 / 180.0
    cur.execute("SELECT place_id, name, lat, lon, types_json, primary_type, address, rating, price_level, last_updated FROM merchants")
    rows = cur.fetchall()
    con.close()

    if not rows:
        return pl.DataFrame(schema={**MERCHANTS_SCHEMA, "distance_km": pl.Float64})

    filtered = []
    for row in rows:
        m = _row_to_merchant(row)
        dlat = m["lat"] - lat
        dlon = m["lon"] - lon
        dist = km_per_degree * (dlat**2 + dlon**2) ** 0.5
        m["distance_km"] = dist
        if dist <= radius_km:
            filtered.append(m)

    if not filtered:
        return pl.DataFrame(schema={**MERCHANTS_SCHEMA, "distance_km": pl.Float64})

    return pl.DataFrame(filtered, schema={**MERCHANTS_SCHEMA, "distance_km": pl.Float64})


def get_merchants_count() -> int:
    db_path = _get_db_path()
    con = sqlite3.connect(str(db_path))
    cur = con.cursor()
    cur.execute("SELECT COUNT(*) FROM merchants")
    count = cur.fetchone()[0]
    con.close()
    return count


def get_weather_age_minutes() -> int | None:
    db_path = _get_db_path()
    con = sqlite3.connect(str(db_path))
    cur = con.cursor()
    cur.execute("SELECT timestamp FROM weather ORDER BY id DESC LIMIT 1")
    row = cur.fetchone()
    con.close()
    if row is None:
        return None
    ts = datetime.fromisoformat(row[0])
    return int((datetime.now() - ts).total_seconds() / 60)


def get_merchants_age_hours() -> int | None:
    db_path = _get_db_path()
    con = sqlite3.connect(str(db_path))
    cur = con.cursor()
    cur.execute("SELECT last_updated FROM merchants LIMIT 1")
    row = cur.fetchone()
    con.close()
    if row is None:
        return None
    ts = datetime.fromisoformat(row[0])
    return int((datetime.now() - ts).total_seconds() / 3600)