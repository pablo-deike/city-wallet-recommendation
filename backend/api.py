from datetime import datetime
import json
import math
import os
import sqlite3
import uuid
from urllib.parse import urlencode
from urllib.request import Request as UrlRequest, urlopen
import httpx

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.rules import (
    AutoRule,
    AutoRuleCreate,
    AutoRuleUpdate,
    AutoRuleType,
    SpecialOffer,
    SpecialOfferCreate,
    SpecialOfferUpdate,
    AutoOfferInstance,
    AutoOfferCreate,
    AUTO_RULE_METADATA,
    AUTO_RULE_DEFAULTS,
    auto_rules_db,
    special_offers_db,
    auto_offers_db,
    get_merchant_auto_rules,
    create_default_auto_rules,
    evaluate_auto_rules,
    evaluate_special_offers,
)

from src.backend import db as google_db

app = FastAPI(title="City Wallet API")


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    messages = []
    for error in exc.errors():
        loc = ".".join(str(part) for part in error.get("loc", []) if part != "body")
        msg = error.get("msg", "Invalid request")
        messages.append(f"{loc}: {msg}" if loc else msg)

    return JSONResponse(
        status_code=422,
        content={"error": "; ".join(messages) or "Invalid request"},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

conn = sqlite3.connect("city_wallet.db", check_same_thread=False)
cursor = conn.cursor()

cursor.execute("""
CREATE TABLE IF NOT EXISTS merchants (
    merchant_id TEXT PRIMARY KEY,
    name TEXT,
    lat REAL,
    lon REAL,
    max_discount INTEGER,
    quiet_threshold INTEGER,
    offer_duration INTEGER,
    place_id TEXT,
    address TEXT
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS offers (
    offer_id TEXT PRIMARY KEY,
    merchant_id TEXT,
    user_id TEXT,
    discount TEXT,
    emoji TEXT,
    distance_m INTEGER,
    headline TEXT,
    code TEXT,
    created_at TEXT,
    accepted_at TEXT,
    status TEXT,
    FOREIGN KEY(merchant_id) REFERENCES merchants(merchant_id)
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS wallets (
    user_id TEXT PRIMARY KEY,
    balance REAL
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS merchant_stats (
    merchant_id TEXT PRIMARY KEY,
    offers_sent INTEGER DEFAULT 0,
    offers_accepted INTEGER DEFAULT 0,
    cashback_issued REAL DEFAULT 0.0,
    FOREIGN KEY(merchant_id) REFERENCES merchants(merchant_id)
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS auto_offers (
    offer_id TEXT PRIMARY KEY,
    merchant_id TEXT,
    rule_type TEXT,
    discount_percent INTEGER,
    trigger_config TEXT,
    offer_duration_minutes INTEGER,
    product_name TEXT,
    created_at TEXT,
    updated_at TEXT
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS special_offers (
    offer_id TEXT PRIMARY KEY,
    merchant_id TEXT,
    title TEXT,
    description TEXT,
    discount_percent INTEGER,
    product_category TEXT,
    product_name TEXT,
    start_time TEXT,
    end_time TEXT,
    max_redemptions INTEGER,
    redemptions_count INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY(merchant_id) REFERENCES merchants(merchant_id)
)
""")

conn.commit()

SPECIAL_OFFER_SELECT = """
SELECT offer_id, merchant_id, title, description, discount_percent, product_category,
       product_name, start_time, end_time, max_redemptions, redemptions_count,
       active, created_at, updated_at
FROM special_offers
"""

AUTO_OFFER_SELECT = """
SELECT offer_id, merchant_id, rule_type, discount_percent, trigger_config,
       offer_duration_minutes, product_name, created_at, updated_at
FROM auto_offers
"""

class ContextPayload(BaseModel):
    user_id: str
    lat: float
    lon: float
    weather: str
    temperature: int

class ClaimPayload(BaseModel):
    user_id: str


class AcceptPayload(ClaimPayload):
    pass


class RedeemPayload(BaseModel):
    user_id: str
    qr_token: str
    purchase_amount: float = 10.0


class CheckoutPayload(BaseModel):
    user_id: str
    code: str
    purchase_amount: float = 10.0

class DismissPayload(BaseModel):
    user_id: str
    reason: str | None = None

class UpdateRulesPayload(BaseModel):
    max_discount: int
    quiet_threshold: int
    offer_duration: int

class CreateMerchantPayload(BaseModel):
    merchant_id: str
    name: str
    lat: float
    lon: float
    max_discount: int = 20
    quiet_threshold: int = 5
    offer_duration: int = 15


class MerchantClaimPayload(BaseModel):
    place_id: str
    name: str
    lat: float
    lon: float
    address: str = ""
    merchant_id: str


class SearchMerchantsPayload(BaseModel):
    query: str
    lat: float
    lon: float
    radius: int = 5000


PUBLIC_API_BASE_URL = os.environ.get("PUBLIC_API_BASE_URL", "http://localhost:8000")

GOOGLE_PLACES_BY_MERCHANT = {
    "cafe_mueller": {"place_id": "ChIJN1t_tDeuEmsRUsoyG83frY4"},
}


def build_google_maps_source_image_url(merchant_id: str, lat: float, lon: float) -> str:
    api_key = os.environ.get("GOOGLE_PLACES_WEATHER_API_KEY") or os.environ.get("GOOGLE_MAPS_API_KEY")
    place_meta = GOOGLE_PLACES_BY_MERCHANT.get(merchant_id)

    if place_meta and place_meta.get("place_id") and api_key:
        place_id = place_meta["place_id"]
        details_params = urlencode({"place_id": place_id, "fields": "photos", "key": api_key})
        details_url = f"https://maps.googleapis.com/maps/api/place/details/json?{details_params}"
        try:
            request = UrlRequest(details_url, headers={"User-Agent": "Mozilla/5.0"})
            with urlopen(request, timeout=3) as response:
                data = json.loads(response.read().decode("utf-8"))
            photos = data.get("result", {}).get("photos", [])
            if photos:
                photo_reference = photos[0].get("photo_reference")
                if photo_reference:
                    photo_params = urlencode({"maxwidth": 800, "photo_reference": photo_reference, "key": api_key})
                    return f"https://maps.googleapis.com/maps/api/place/photo?{photo_params}"
        except Exception:
            pass

    if not api_key:
        print("WARNING: GOOGLE_PLACES_WEATHER_API_KEY / GOOGLE_MAPS_API_KEY not set")

    static_params = urlencode({
        "center": f"{lat},{lon}",
        "zoom": 15,
        "size": "400x200",
        "markers": f"color:red|{lat},{lon}",
        "key": api_key or "",
    })
    return f"https://maps.googleapis.com/maps/api/staticmap?{static_params}"


def build_google_maps_assets(merchant_id: str, lat: float, lon: float) -> tuple[str, str]:
    place_meta = GOOGLE_PLACES_BY_MERCHANT.get(merchant_id)

    if place_meta and place_meta.get("place_id"):
        place_id = place_meta["place_id"]
        maps_url = f"https://www.google.com/maps/search/?api=1&query={lat},{lon}&query_place_id={place_id}"
    else:
        maps_url = f"https://www.google.com/maps/search/?api=1&query={lat},{lon}"

    maps_image_url = f"{PUBLIC_API_BASE_URL}/maps/place-image/{merchant_id}?lat={lat}&lon={lon}"

    return maps_url, maps_image_url


@app.get("/maps/place-image/{merchant_id}")
def get_place_image(merchant_id: str, lat: float, lon: float):
    image_source_url = build_google_maps_source_image_url(merchant_id, lat, lon)

    try:
        request = UrlRequest(image_source_url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(request, timeout=8) as response:
            image_bytes = response.read()
            content_type = response.info().get_content_type() or "image/jpeg"
            return Response(content=image_bytes, media_type=content_type)
    except Exception as exc:
        print(f"ERROR: failed to fetch place image for {merchant_id}: {exc}")
        raise HTTPException(status_code=502, detail="Unable to load place image")

cursor.execute("SELECT COUNT(*) FROM merchants")
if cursor.fetchone()[0] == 0:
    cursor.execute("""
    INSERT INTO merchants (merchant_id, name, lat, lon, max_discount, quiet_threshold, offer_duration, place_id, address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, ("cafe_mueller", "Café Müller", 52.5200, 13.4050, 20, 5, 15, None, None))
    cursor.execute("""
    INSERT INTO merchant_stats (merchant_id, offers_sent, offers_accepted, cashback_issued)
    VALUES (?, 0, 0, 0.0)
    """, ("cafe_mueller",))
    conn.commit()

def merchant_exists(merchant_id: str) -> bool:
    cursor.execute("SELECT merchant_id FROM merchants WHERE merchant_id = ?", (merchant_id,))
    return cursor.fetchone() is not None


def _parse_datetime(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def _datetime_to_text(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _special_offer_from_row(row: tuple) -> SpecialOffer:
    (
        offer_id,
        merchant_id,
        title,
        description,
        discount_percent,
        product_category,
        product_name,
        start_time,
        end_time,
        max_redemptions,
        redemptions_count,
        active,
        created_at,
        updated_at,
    ) = row

    return SpecialOffer(
        offer_id=offer_id,
        merchant_id=merchant_id,
        title=title,
        description=description,
        discount_percent=discount_percent,
        product_category=product_category,
        product_name=product_name,
        start_time=_parse_datetime(start_time),
        end_time=_parse_datetime(end_time),
        max_redemptions=max_redemptions,
        redemptions_count=redemptions_count,
        active=bool(active),
        created_at=_parse_datetime(created_at) or datetime.now(),
        updated_at=_parse_datetime(updated_at) or datetime.now(),
    )


def _serialize_special_offer(offer: SpecialOffer) -> dict[str, object]:
    return {
        "offer_id": offer.offer_id,
        "title": offer.title,
        "description": offer.description,
        "discount_percent": offer.discount_percent,
        "product_category": offer.product_category,
        "product_name": offer.product_name,
        "start_time": offer.start_time.isoformat() if offer.start_time else None,
        "end_time": offer.end_time.isoformat() if offer.end_time else None,
        "max_redemptions": offer.max_redemptions,
        "redemptions_count": offer.redemptions_count,
        "active": offer.active,
        "created_at": offer.created_at.isoformat(),
        "updated_at": offer.updated_at.isoformat(),
    }


def _get_special_offer(offer_id: str) -> SpecialOffer | None:
    cursor.execute(f"{SPECIAL_OFFER_SELECT} WHERE offer_id = ?", (offer_id,))
    row = cursor.fetchone()
    return _special_offer_from_row(row) if row else None


def _get_special_offers_from_db(merchant_id: str) -> list[SpecialOffer]:
    cursor.execute(
        f"{SPECIAL_OFFER_SELECT} WHERE merchant_id = ? ORDER BY created_at DESC",
        (merchant_id,),
    )
    return [_special_offer_from_row(row) for row in cursor.fetchall()]


def _sync_special_offers_for_evaluation(merchant_id: str) -> None:
    for offer_id, offer in list(special_offers_db.items()):
        if offer.merchant_id == merchant_id:
            del special_offers_db[offer_id]

    for offer in _get_special_offers_from_db(merchant_id):
        special_offers_db[offer.offer_id] = offer


def _auto_offer_from_row(row: tuple) -> AutoOfferInstance:
    (
        offer_id,
        merchant_id,
        rule_type,
        discount_percent,
        trigger_config_json,
        offer_duration_minutes,
        product_name,
        created_at,
        updated_at,
    ) = row

    return AutoOfferInstance(
        offer_id=offer_id,
        merchant_id=merchant_id,
        rule_type=AutoRuleType(rule_type),
        discount_percent=discount_percent,
        trigger_config=json.loads(trigger_config_json) if trigger_config_json else {},
        offer_duration_minutes=offer_duration_minutes or 30,
        product_name=product_name,
        created_at=_parse_datetime(created_at) or datetime.now(),
        updated_at=_parse_datetime(updated_at) or datetime.now(),
    )


def _get_auto_offers_from_db(merchant_id: str) -> list[AutoOfferInstance]:
    cursor.execute(
        f"{AUTO_OFFER_SELECT} WHERE merchant_id = ? ORDER BY created_at DESC",
        (merchant_id,),
    )
    return [_auto_offer_from_row(row) for row in cursor.fetchall()]


def _sync_auto_offers_for_evaluation(merchant_id: str) -> None:
    for rule_id, rule in list(auto_rules_db.items()):
        if rule.merchant_id == merchant_id and rule.rule_id.startswith("autooffer_"):
            del auto_rules_db[rule_id]

    for offer in _get_auto_offers_from_db(merchant_id):
        trigger_config = dict(offer.trigger_config)
        if offer.product_name and "product_name" not in trigger_config:
            trigger_config["product_name"] = offer.product_name

        auto_offers_db[offer.offer_id] = offer
        auto_rules_db[offer.offer_id] = AutoRule(
            rule_id=offer.offer_id,
            merchant_id=offer.merchant_id,
            rule_type=offer.rule_type,
            enabled=True,
            discount_percent=offer.discount_percent,
            trigger_config=trigger_config,
            offer_duration_minutes=offer.offer_duration_minutes,
            created_at=offer.created_at,
            updated_at=offer.updated_at,
        )


def _precipitation_from_weather(weather: str) -> float:
    weather_text = weather.lower()
    return 1.0 if any(token in weather_text for token in ("rain", "drizzle", "shower", "storm", "snow")) else 0.0


def _offer_context(ctx: ContextPayload, quiet_threshold: int) -> dict[str, object]:
    return {
        "weather": ctx.weather,
        "temperature": ctx.temperature,
        "precipitation_mm": _precipitation_from_weather(ctx.weather),
        "payone_density": max(0, quiet_threshold - 1),
    }


def _configured_product(value: str | None, fallback: str) -> str:
    return value.strip() if value and value.strip() else fallback


def _weather_candidate(rule: AutoRule, context: dict[str, object]) -> dict[str, object]:
    cfg = rule.trigger_config
    temp = int(context.get("temperature", 15))
    is_rainy = float(context.get("precipitation_mm", 0)) > 0
    matches = []

    if cfg.get("cold_enabled") and temp < int(cfg.get("cold_temp_c", 5)):
        matches.append({
            "discount_percent": int(cfg.get("cold_discount_percent", rule.discount_percent)),
            "product": _configured_product(cfg.get("cold_product"), "hot drinks"),
            "headline": "Warm up nearby",
            "reason": f"Cold weather matches this merchant rule - valid for {rule.offer_duration_minutes} minutes",
            "emoji": "☕",
        })

    if cfg.get("rain_enabled") and is_rainy:
        matches.append({
            "discount_percent": int(cfg.get("rain_discount_percent", rule.discount_percent)),
            "product": _configured_product(cfg.get("rain_product"), "a rainy-day treat"),
            "headline": "Rainy day offer nearby",
            "reason": f"Rain matches this merchant rule - valid for {rule.offer_duration_minutes} minutes",
            "emoji": "🌧️",
        })

    if cfg.get("hot_enabled") and temp > int(cfg.get("hot_temp_c", 25)):
        matches.append({
            "discount_percent": int(cfg.get("hot_discount_percent", rule.discount_percent)),
            "product": _configured_product(cfg.get("hot_product"), "cold drinks"),
            "headline": "Cool down nearby",
            "reason": f"Hot weather matches this merchant rule - valid for {rule.offer_duration_minutes} minutes",
            "emoji": "🧊",
        })

    if not matches:
        return {
            "discount_percent": rule.discount_percent,
            "product": _configured_product(None, "today's weather pick"),
            "headline": "Weather match nearby",
            "reason": f"Weather matches this merchant rule - valid for {rule.offer_duration_minutes} minutes",
            "emoji": "✨",
        }

    return max(matches, key=lambda match: int(match["discount_percent"]))


def _auto_rule_candidate(rule: AutoRule, context: dict[str, object]) -> dict[str, object]:
    if rule.rule_type == AutoRuleType.WEATHER_MATCH:
        weather = _weather_candidate(rule, context)
        return {
            **weather,
            "discount": f"{weather['discount_percent']}% off {weather['product']}",
            "valid_minutes": rule.offer_duration_minutes,
            "priority": 1,
        }

    product = _configured_product(rule.trigger_config.get("reward_product"), "your next visit")
    headline = "Offer nearby"
    reason = f"Merchant rule matched - valid for {rule.offer_duration_minutes} minutes"
    emoji = "✨"

    if rule.rule_type == AutoRuleType.FIRST_VISIT:
        product = _configured_product(rule.trigger_config.get("product_name"), product)
        headline = "First visit perk"
        reason = f"New customer rule matched - valid for {rule.offer_duration_minutes} minutes"
    elif rule.rule_type == AutoRuleType.LOYALTY_REWARD:
        product = _configured_product(rule.trigger_config.get("reward_product"), "your loyalty reward")
        headline = "Loyalty reward unlocked"
        reason = f"Visit history matches this merchant rule - valid for {rule.offer_duration_minutes} minutes"
        emoji = "🏅"
    elif rule.rule_type == AutoRuleType.QUIET_HOUR:
        product = _configured_product(rule.trigger_config.get("product_name"), "quiet-hour picks")
        headline = "Quiet nearby"
        reason = f"Quiet right now - offer valid for {rule.offer_duration_minutes} minutes"
        emoji = "☕"

    return {
        "discount_percent": rule.discount_percent,
        "discount": f"{rule.discount_percent}% off {product}",
        "headline": headline,
        "reason": reason,
        "emoji": emoji,
        "valid_minutes": rule.offer_duration_minutes,
        "priority": 1,
    }


def _special_offer_candidate(offer: SpecialOffer, default_duration: int) -> dict[str, object]:
    emoji_by_category = {
        "coffee": "☕",
        "food": "🥐",
        "dessert": "🍰",
        "other": "✨",
    }
    product = _configured_product(offer.product_name, offer.title)
    return {
        "discount_percent": offer.discount_percent,
        "discount": f"{offer.discount_percent}% off {product}",
        "headline": offer.title,
        "reason": offer.description,
        "emoji": emoji_by_category.get(offer.product_category, "✨"),
        "valid_minutes": default_duration,
        "priority": 2,
    }


def _matched_offer_payload(
    ctx: ContextPayload,
    merchant_id: str,
    offer_duration: int,
    context: dict[str, object],
) -> dict[str, object] | None:
    _sync_auto_offers_for_evaluation(merchant_id)
    _sync_special_offers_for_evaluation(merchant_id)

    auto_matches = evaluate_auto_rules(merchant_id, ctx.user_id, context, create_defaults=False)
    special_matches = evaluate_special_offers(merchant_id, context)
    candidates = [_auto_rule_candidate(rule, context) for rule in auto_matches]
    candidates.extend(_special_offer_candidate(offer, offer_duration) for offer in special_matches)

    if not candidates:
        return None

    return max(candidates, key=lambda candidate: (int(candidate["discount_percent"]), int(candidate["priority"])))


@app.post("/offers/generate")
def generate_offer(ctx: ContextPayload):
    cursor.execute("""
    SELECT merchant_id, name, lat, lon, max_discount, quiet_threshold, offer_duration
    FROM merchants
    """)
    merchants = cursor.fetchall()
    if not merchants:
        return {"error": "No merchants found"}

    nearest = None
    min_distance = float("inf")
    for row in merchants:
        merchant_id, name, lat, lon, max_discount, quiet_threshold, offer_duration = row
        distance = math.sqrt((lat - ctx.lat)**2 + (lon - ctx.lon)**2) * 111000
        if distance < min_distance:
            min_distance = distance
            nearest = (merchant_id, name, lat, lon, max_discount, quiet_threshold, offer_duration, distance)

    if not nearest:
        return {"error": "No merchants found"}

    merchant_id, name, lat, lon, max_discount, quiet_threshold, offer_duration, distance_m = nearest
    context = _offer_context(ctx, quiet_threshold)
    matched_payload = _matched_offer_payload(ctx, merchant_id, offer_duration, context)

    if matched_payload:
        discount = str(matched_payload["discount"])
        emoji = str(matched_payload["emoji"])
        headline = str(matched_payload["headline"])
        reason = str(matched_payload["reason"])
        valid_minutes = int(matched_payload["valid_minutes"])
    else:
        if ctx.temperature < 5:
            discount = f"{max_discount}% off any hot drink"
            emoji = "☕"
            headline = "Warm up nearby"
        else:
            discount = f"{int(max_discount * 0.9)}% off pastry + drink"
            emoji = "🥐"
            headline = "Treat yourself"

        reason = f"Quiet right now - offer valid for {offer_duration} minutes"
        valid_minutes = offer_duration

    offer_id = f"offer_{uuid.uuid4().hex[:12]}"
    created_at = datetime.now().isoformat()

    cursor.execute("""
    INSERT INTO offers (offer_id, merchant_id, discount, emoji, distance_m, headline, created_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (offer_id, merchant_id, discount, emoji, int(distance_m), headline, created_at, "generated"))

    cursor.execute("""
    UPDATE merchant_stats SET offers_sent = offers_sent + 1 WHERE merchant_id = ?
    """, (merchant_id,))
    conn.commit()

    maps_url, maps_image_url = build_google_maps_assets(merchant_id, lat, lon)

    return {
        "offer_id": offer_id,
        "merchant_id": merchant_id,
        "merchant": name,
        "merchant_lat": lat,
        "merchant_lon": lon,
        "discount": discount,
        "emoji": emoji,
        "distance_m": int(distance_m),
        "headline": headline,
        "reason": reason,
        "valid_minutes": valid_minutes,
        "created_at": created_at,
        "status": "generated",
        "expires_in_seconds": valid_minutes * 60,
        "message": f"Offer valid for {valid_minutes} minutes",
        "maps_url": maps_url,
        "maps_image_url": maps_image_url,
    }

def _claim_offer(offer_id: str, user_id: str):
    cursor.execute("""
    SELECT offer_id, merchant_id, discount, created_at, status
    FROM offers WHERE offer_id = ?
    """, (offer_id,))
    row = cursor.fetchone()

    if not row:
        return {"error": "Offer not found"}

    offer_id_db, merchant_id, discount, created_at, status = row

    created_time = datetime.fromisoformat(created_at)
    if (datetime.now() - created_time).total_seconds() > 120:
        return {"error": "Offer expired"}

    qr_token = f"QR-{merchant_id[:4].upper()}-{int(datetime.now().timestamp()) % 1000}"

    cursor.execute("""
    UPDATE offers SET status = ?, accepted_at = ?, user_id = ?, code = ?
    WHERE offer_id = ?
    """, ("accepted", datetime.now().isoformat(), user_id, qr_token, offer_id))
    conn.commit()

    cursor.execute("SELECT name FROM merchants WHERE merchant_id = ?", (merchant_id,))
    merchant_name = cursor.fetchone()[0]

    return {
        "qr_token": qr_token,
        "merchant": merchant_name,
        "discount": discount,
        "expires_in_seconds": 600,
    }


@app.post("/offers/{offer_id}/claim")
def claim_offer(offer_id: str, body: ClaimPayload):
    return _claim_offer(offer_id, body.user_id)


@app.post("/offers/{offer_id}/accept")
def accept_offer(offer_id: str, body: AcceptPayload):
    claim = _claim_offer(offer_id, body.user_id)
    if "error" in claim:
        return claim

    return {
        "code": claim["qr_token"],
        "merchant": claim["merchant"],
        "discount": claim["discount"],
        "checkout_expires_in": claim["expires_in_seconds"],
        "message": "Show this code at checkout (valid 10 min)",
    }


def _redeem_offer(offer_id: str, user_id: str, token: str, purchase_amount: float):
    cursor.execute("""
    SELECT offer_id, merchant_id, discount, code, status, accepted_at
    FROM offers WHERE offer_id = ?
    """, (offer_id,))
    row = cursor.fetchone()

    if not row:
        return {"error": "Offer not found"}

    offer_id_db, merchant_id, discount, code, status, accepted_at = row

    if status != "accepted":
        return {"error": "Offer must be accepted first"}

    if code != token:
        return {"error": "Invalid code"}

    accepted_time = datetime.fromisoformat(accepted_at)
    if (datetime.now() - accepted_time).total_seconds() > 600:
        return {"error": "Code expired"}

    try:
        discount_percent = int(discount.split("%")[0])
    except (ValueError, IndexError):
        discount_percent = 0

    cashback = (purchase_amount * discount_percent) / 100

    cursor.execute("""
    INSERT INTO wallets (user_id, balance)
    VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET balance = balance + ?
    """, (user_id, cashback, cashback))

    cursor.execute("""
    UPDATE merchant_stats 
    SET offers_accepted = offers_accepted + 1, cashback_issued = cashback_issued + ?
    WHERE merchant_id = ?
    """, (cashback, merchant_id))

    cursor.execute("UPDATE offers SET status = ? WHERE offer_id = ?", ("redeemed", offer_id))
    conn.commit()

    cursor.execute("SELECT balance FROM wallets WHERE user_id = ?", (user_id,))
    balance = cursor.fetchone()[0]

    return {
        "success": True,
        "cashback_earned": round(cashback, 2),
        "new_balance": round(balance, 2),
        "message": f"{cashback:.2f} EUR cashback applied"
    }


@app.post("/offers/{offer_id}/redeem")
def redeem_offer(offer_id: str, body: RedeemPayload):
    return _redeem_offer(offer_id, body.user_id, body.qr_token, body.purchase_amount)


@app.post("/offers/{offer_id}/checkout")
def checkout_offer(offer_id: str, body: CheckoutPayload):
    return _redeem_offer(offer_id, body.user_id, body.code, body.purchase_amount)

@app.post("/offers/{offer_id}/dismiss")
def dismiss_offer(offer_id: str, body: DismissPayload):
    cursor.execute("UPDATE offers SET status = ? WHERE offer_id = ?", ("dismissed", offer_id))
    conn.commit()
    return {"message": "Offer dismissed"}

@app.get("/user/{user_id}/wallet")
def get_wallet(user_id: str):
    cursor.execute("SELECT balance FROM wallets WHERE user_id = ?", (user_id,))
    row = cursor.fetchone()
    balance = row[0] if row else 0.0
    return {"balance": round(balance, 2)}

@app.get("/merchant/{merchant_id}/stats")
def get_merchant_stats(merchant_id: str):
    if not merchant_exists(merchant_id):
        return {"error": f"Merchant {merchant_id} not found"}

    cursor.execute("SELECT name FROM merchants WHERE merchant_id = ?", (merchant_id,))
    merchant_name = cursor.fetchone()[0]

    cursor.execute("""
    SELECT offers_sent, offers_accepted, cashback_issued
    FROM merchant_stats WHERE merchant_id = ?
    """, (merchant_id,))

    stats_row = cursor.fetchone()
    if stats_row:
        offers_sent, offers_accepted, cashback_issued = stats_row
    else:
        offers_sent, offers_accepted, cashback_issued = 0, 0, 0.0

    accept_rate = offers_accepted / offers_sent if offers_sent > 0 else 0

    return {
        "merchant_id": merchant_id,
        "merchant_name": merchant_name,
        "offers_sent_today": offers_sent,
        "offers_accepted": offers_accepted,
        "accept_rate": round(accept_rate, 2),
        "cashback_issued": round(cashback_issued, 2),
    }

@app.get("/merchant/{merchant_id}/offers")
def get_offer_feed(merchant_id: str):
    if not merchant_exists(merchant_id):
        return {"error": f"Merchant {merchant_id} not found"}

    cursor.execute("""
    SELECT offer_id, created_at, discount, status, distance_m
    FROM offers WHERE merchant_id = ?
    ORDER BY created_at DESC LIMIT 5
    """, (merchant_id,))

    offers = []
    for row in cursor.fetchall():
        offer_id, created_at, discount, status, distance_m = row
        offers.append({
            "offer_id": offer_id,
            "time": created_at,
            "offer": discount,
            "status": status.capitalize(),
            "distance": f"{distance_m}m",
        })

    return {
        "merchant_id": merchant_id,
        "total_offers": len(offers),
        "offers": offers,
    }


@app.get("/merchant/{merchant_id}/rules")
def get_merchant_rules(merchant_id: str):
    if not merchant_exists(merchant_id):
        return {"error": f"Merchant {merchant_id} not found"}

    cursor.execute("""
    SELECT max_discount, quiet_threshold, offer_duration
    FROM merchants WHERE merchant_id = ?
    """, (merchant_id,))
    max_discount, quiet_threshold, offer_duration = cursor.fetchone()

    return {
        "merchant_id": merchant_id,
        "max_discount": max_discount,
        "quiet_threshold": quiet_threshold,
        "offer_duration": offer_duration,
        "goal": "Fill quiet hours with nearby wallet offers",
    }


@app.put("/merchant/{merchant_id}/rules")
def update_merchant_rules(merchant_id: str, body: UpdateRulesPayload):
    if not merchant_exists(merchant_id):
        return {"error": f"Merchant {merchant_id} not found"}

    if body.max_discount < 0 or body.max_discount > 100:
        return {"error": "max_discount must be between 0 and 100"}
    if body.quiet_threshold < 0:
        return {"error": "quiet_threshold cannot be negative"}
    if body.offer_duration < 1:
        return {"error": "offer_duration must be at least 1 minute"}

    cursor.execute("""
    UPDATE merchants 
    SET max_discount = ?, quiet_threshold = ?, offer_duration = ?
    WHERE merchant_id = ?
    """, (body.max_discount, body.quiet_threshold, body.offer_duration, merchant_id))
    conn.commit()

    return {
        "success": True,
        "merchant_id": merchant_id,
        "updated": {
            "max_discount": body.max_discount,
            "quiet_threshold": body.quiet_threshold,
            "offer_duration": body.offer_duration,
        },
    }

@app.post("/merchant")
def create_merchant(body: CreateMerchantPayload):
    cursor.execute("SELECT merchant_id FROM merchants WHERE merchant_id = ?", (body.merchant_id,))
    if cursor.fetchone():
        return {"error": f"Merchant {body.merchant_id} already exists"}

    cursor.execute("""
    INSERT INTO merchants (merchant_id, name, lat, lon, max_discount, quiet_threshold, offer_duration)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (body.merchant_id, body.name, body.lat, body.lon, body.max_discount, body.quiet_threshold, body.offer_duration))

    cursor.execute("""
    INSERT INTO merchant_stats (merchant_id, offers_sent, offers_accepted, cashback_issued)
    VALUES (?, 0, 0, 0.0)
    """, (body.merchant_id,))
    conn.commit()

    return {"success": True, "merchant_id": body.merchant_id}


@app.get("/merchant/{merchant_id}/auto-rules")
def get_auto_rules(merchant_id: str):
    if not merchant_exists(merchant_id):
        return {"error": f"Merchant {merchant_id} not found"}

    rules = get_merchant_auto_rules(merchant_id)
    if not rules:
        rules = create_default_auto_rules(merchant_id)

    rules_data = []
    for rule in rules:
        meta = AUTO_RULE_METADATA.get(rule.rule_type, {})
        rules_data.append({
            "rule_id": rule.rule_id,
            "rule_type": rule.rule_type.value,
            "name": meta.get("name", rule.rule_type.value),
            "description": meta.get("description", ""),
            "trigger_source": meta.get("trigger_source", "user_history").value,
            "enabled": rule.enabled,
            "discount_percent": rule.discount_percent,
            "offer_duration_minutes": rule.offer_duration_minutes,
            "trigger_config": rule.trigger_config,
            "created_at": rule.created_at.isoformat(),
            "updated_at": rule.updated_at.isoformat(),
        })

    return {"merchant_id": merchant_id, "rules": rules_data}

@app.post("/merchant/{merchant_id}/auto-rules")
def create_auto_rule(merchant_id: str, body: AutoRuleCreate):
    if not merchant_exists(merchant_id):
        return {"error": f"Merchant {merchant_id} not found"}

    rule_id = f"auto_{merchant_id}_{body.rule_type.value}_{uuid.uuid4().hex[:8]}"
    now = datetime.now()

    rule = AutoRule(
        rule_id=rule_id,
        merchant_id=merchant_id,
        rule_type=body.rule_type,
        enabled=body.enabled,
        discount_percent=body.discount_percent,
        trigger_config=body.trigger_config,
        offer_duration_minutes=body.offer_duration_minutes or 30,
        created_at=now,
        updated_at=now,
    )

    auto_rules_db[rule_id] = rule

    meta = AUTO_RULE_METADATA.get(rule.rule_type, {})
    return {
        "success": True,
        "rule": {
            "rule_id": rule_id,
            "rule_type": rule.rule_type.value,
            "name": meta.get("name", rule.rule_type.value),
            "enabled": rule.enabled,
            "discount_percent": rule.discount_percent,
            "offer_duration_minutes": rule.offer_duration_minutes,
            "trigger_config": rule.trigger_config,
        },
    }

@app.put("/merchant/{merchant_id}/auto-rules/{rule_id}")
def update_auto_rule(merchant_id: str, rule_id: str, body: AutoRuleUpdate):
    if not merchant_exists(merchant_id):
        return {"error": f"Merchant {merchant_id} not found"}

    if rule_id not in auto_rules_db:
        return {"error": f"Rule {rule_id} not found"}

    rule = auto_rules_db[rule_id]
    if rule.merchant_id != merchant_id:
        return {"error": f"Rule {rule_id} does not belong to merchant {merchant_id}"}

    if body.enabled is not None:
        rule.enabled = body.enabled
    if body.discount_percent is not None:
        rule.discount_percent = body.discount_percent
    if body.trigger_config is not None:
        rule.trigger_config = body.trigger_config
    if body.offer_duration_minutes is not None:
        rule.offer_duration_minutes = body.offer_duration_minutes

    rule.updated_at = datetime.now()

    return {
        "success": True,
        "rule": {
            "rule_id": rule.rule_id,
            "rule_type": rule.rule_type.value,
            "enabled": rule.enabled,
            "discount_percent": rule.discount_percent,
            "offer_duration_minutes": rule.offer_duration_minutes,
            "trigger_config": rule.trigger_config,
        },
    }

@app.delete("/merchant/{merchant_id}/auto-rules/{rule_id}")
def delete_auto_rule(merchant_id: str, rule_id: str):
    if rule_id not in auto_rules_db:
        return {"error": f"Rule {rule_id} not found"}

    rule = auto_rules_db[rule_id]
    if rule.merchant_id != merchant_id:
        return {"error": f"Rule {rule_id} does not belong to merchant {merchant_id}"}

    del auto_rules_db[rule_id]
    return {"success": True, "deleted": rule_id}


@app.get("/merchant/{merchant_id}/special-offers")
def get_special_offers(merchant_id: str):
    if not merchant_exists(merchant_id):
        return {"error": f"Merchant {merchant_id} not found"}

    offers_data = [_serialize_special_offer(offer) for offer in _get_special_offers_from_db(merchant_id)]

    return {"merchant_id": merchant_id, "offers": offers_data}

@app.post("/merchant/{merchant_id}/special-offers")
def create_special_offer(merchant_id: str, body: SpecialOfferCreate):
    if not merchant_exists(merchant_id):
        return {"error": f"Merchant {merchant_id} not found"}

    offer_id = f"special_{merchant_id}_{uuid.uuid4().hex[:8]}"
    now = datetime.now()

    offer = SpecialOffer(
        offer_id=offer_id,
        merchant_id=merchant_id,
        title=body.title,
        description=body.description,
        discount_percent=body.discount_percent,
        product_category=body.product_category,
        product_name=body.product_name,
        start_time=body.start_time,
        end_time=body.end_time,
        max_redemptions=body.max_redemptions,
        redemptions_count=0,
        active=True,
        created_at=now,
        updated_at=now,
    )

    cursor.execute(
        """
        INSERT INTO special_offers (
            offer_id, merchant_id, title, description, discount_percent,
            product_category, product_name, start_time, end_time,
            max_redemptions, redemptions_count, active, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            offer.offer_id,
            offer.merchant_id,
            offer.title,
            offer.description,
            offer.discount_percent,
            offer.product_category,
            offer.product_name,
            _datetime_to_text(offer.start_time),
            _datetime_to_text(offer.end_time),
            offer.max_redemptions,
            offer.redemptions_count,
            int(offer.active),
            offer.created_at.isoformat(),
            offer.updated_at.isoformat(),
        ),
    )
    conn.commit()
    special_offers_db[offer_id] = offer

    return {
        "success": True,
        "offer": _serialize_special_offer(offer),
    }

@app.put("/merchant/{merchant_id}/special-offers/{offer_id}")
def update_special_offer(merchant_id: str, offer_id: str, body: SpecialOfferUpdate):
    if not merchant_exists(merchant_id):
        return {"error": f"Merchant {merchant_id} not found"}

    offer = _get_special_offer(offer_id)
    if not offer:
        return {"error": f"Offer {offer_id} not found"}

    if offer.merchant_id != merchant_id:
        return {"error": f"Offer {offer_id} does not belong to merchant {merchant_id}"}

    update_data = body.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now()

    column_values = []
    values = []
    for field, value in update_data.items():
        if field in {"start_time", "end_time", "created_at", "updated_at"}:
            value = _datetime_to_text(value)
        elif field == "active":
            value = int(value)
        column_values.append(f"{field} = ?")
        values.append(value)

    values.append(offer_id)
    cursor.execute(
        f"UPDATE special_offers SET {', '.join(column_values)} WHERE offer_id = ?",
        values,
    )
    conn.commit()

    updated_offer = _get_special_offer(offer_id)
    if updated_offer:
        special_offers_db[offer_id] = updated_offer

    return {
        "success": True,
        "offer": _serialize_special_offer(updated_offer or offer),
    }

@app.delete("/merchant/{merchant_id}/special-offers/{offer_id}")
def delete_special_offer(merchant_id: str, offer_id: str):
    if not merchant_exists(merchant_id):
        return {"error": f"Merchant {merchant_id} not found"}

    offer = _get_special_offer(offer_id)
    if not offer:
        return {"error": f"Offer {offer_id} not found"}

    if offer.merchant_id != merchant_id:
        return {"error": f"Offer {offer_id} does not belong to merchant {merchant_id}"}

    cursor.execute("DELETE FROM special_offers WHERE offer_id = ?", (offer_id,))
    conn.commit()
    special_offers_db.pop(offer_id, None)
    return {"success": True, "deleted": offer_id}


@app.get("/merchant/{merchant_id}/auto-offers")
def get_auto_offers(merchant_id: str):
    if not merchant_exists(merchant_id):
        return {"error": f"Merchant {merchant_id} not found"}

    offers_data = []
    for offer in _get_auto_offers_from_db(merchant_id):
        meta = AUTO_RULE_METADATA.get(offer.rule_type, {})
        offers_data.append({
            "offer_id": offer.offer_id,
            "rule_type": offer.rule_type.value,
            "rule_name": meta.get("name", offer.rule_type.value),
            "discount_percent": offer.discount_percent,
            "trigger_config": offer.trigger_config,
            "offer_duration_minutes": offer.offer_duration_minutes,
            "product_name": offer.product_name,
            "created_at": offer.created_at.isoformat(),
            "updated_at": offer.updated_at.isoformat(),
        })

    return {"merchant_id": merchant_id, "offers": offers_data}


@app.post("/merchant/{merchant_id}/auto-offers")
def create_auto_offer(merchant_id: str, body: AutoOfferCreate):
    if not merchant_exists(merchant_id):
        return {"error": f"Merchant {merchant_id} not found"}

    import json as json_module
    offer_id = f"autooffer_{merchant_id}_{body.rule_type.value}_{uuid.uuid4().hex[:8]}"
    now = datetime.now()
    now_iso = now.isoformat()

    cursor.execute(
        "INSERT INTO auto_offers (offer_id, merchant_id, rule_type, discount_percent, trigger_config, offer_duration_minutes, product_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            offer_id,
            merchant_id,
            body.rule_type.value,
            body.discount_percent,
            json_module.dumps(body.trigger_config),
            body.offer_duration_minutes or 30,
            body.product_name,
            now_iso,
            now_iso,
        ),
    )
    conn.commit()
    auto_offers_db[offer_id] = AutoOfferInstance(
        offer_id=offer_id,
        merchant_id=merchant_id,
        rule_type=body.rule_type,
        discount_percent=body.discount_percent,
        trigger_config=body.trigger_config,
        offer_duration_minutes=body.offer_duration_minutes or 30,
        product_name=body.product_name,
        created_at=now,
        updated_at=now,
    )

    meta = AUTO_RULE_METADATA.get(body.rule_type, {})
    return {
        "success": True,
        "offer": {
            "offer_id": offer_id,
            "rule_type": body.rule_type.value,
            "rule_name": meta.get("name", body.rule_type.value),
            "discount_percent": body.discount_percent,
            "trigger_config": body.trigger_config,
            "offer_duration_minutes": body.offer_duration_minutes or 30,
            "product_name": body.product_name,
            "created_at": now_iso,
            "updated_at": now_iso,
        },
    }


@app.delete("/merchant/{merchant_id}/auto-offers/{offer_id}")
def delete_auto_offer(merchant_id: str, offer_id: str):
    cursor.execute("SELECT merchant_id FROM auto_offers WHERE offer_id = ?", (offer_id,))
    row = cursor.fetchone()

    if not row:
        return {"error": f"Offer {offer_id} not found"}

    if row[0] != merchant_id:
        return {"error": f"Offer {offer_id} does not belong to merchant {merchant_id}"}

    cursor.execute("DELETE FROM auto_offers WHERE offer_id = ?", (offer_id,))
    conn.commit()
    auto_offers_db.pop(offer_id, None)
    auto_rules_db.pop(offer_id, None)

    return {"success": True, "deleted": offer_id}


@app.get("/auto-rules/types")
def get_auto_rule_types():
    types_data = []
    for rule_type in AutoRuleType:
        meta = AUTO_RULE_METADATA.get(rule_type, {})
        defaults = AUTO_RULE_DEFAULTS.get(rule_type, {})
        types_data.append({
            "type": rule_type.value,
            "name": meta.get("name", rule_type.value),
            "description": meta.get("description", ""),
            "trigger_source": meta.get("trigger_source", "user_history").value,
            "default_discount_percent": defaults.get("discount_percent", 10),
            "default_trigger_config": defaults.get("trigger_config", {}),
        })

    return {"rule_types": types_data}


@app.get("/api/merchants/nearby")
def get_nearby_merchants(lat: float, lon: float, radius_km: float = 1.0):
    try:
        google_db.init_db()
        df = google_db.filter_merchants_by_distance(lat, lon, radius_km)
        df = df.sort("distance_km")
        merchants = []
        for row in df.to_dicts():
            merchants.append({
                "place_id": row.get("place_id"),
                "name": row.get("name"),
                "lat": row.get("lat"),
                "lon": row.get("lon"),
                "address": row.get("address"),
                "distance_km": round(row.get("distance_km", 0), 2),
                "rating": row.get("rating"),
                "types": row.get("types", []),
                "primary_type": row.get("primary_type"),
            })
        return {"count": len(merchants), "merchants": merchants}
    except Exception as e:
        return {"count": 0, "merchants": [], "error": str(e)}


@app.post("/api/merchants/search")
async def search_merchants(body: SearchMerchantsPayload):
    api_key = os.environ.get("GOOGLE_PLACES_WEATHER_API_KEY") or os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return {"count": 0, "places": [], "error": "No API key configured"}

    url = "https://places.googleapis.com/v1/places:searchText"
    headers = {
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.formattedAddress,places.types,places.rating",
        "Content-Type": "application/json",
    }
    body_json = {
        "textQuery": body.query,
        "locationBias": {
            "circle": {
                "center": {"latitude": body.lat, "longitude": body.lon},
                "radius": body.radius,
            }
        },
        "maxResultCount": 20,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=headers, json=body_json)
            data = resp.json()
            places = data.get("places", [])
            results = []
            for p in places:
                loc = p.get("location", {})
                results.append({
                    "place_id": p.get("id"),
                    "name": p.get("displayName", {}).get("text", ""),
                    "lat": loc.get("latitude"),
                    "lon": loc.get("longitude"),
                    "address": p.get("formattedAddress", ""),
                    "types": p.get("types", []),
                    "rating": p.get("rating"),
                })
            return {"count": len(results), "places": results}
    except Exception as e:
        return {"count": 0, "places": [], "error": str(e)}


@app.post("/api/merchants/claim")
def claim_merchant_place(body: MerchantClaimPayload):
    if not merchant_exists(body.merchant_id):
        return {"error": f"Merchant {body.merchant_id} not found"}

    cursor.execute("""
    UPDATE merchants SET place_id = ?, name = ?, lat = ?, lon = ?, address = ?
    WHERE merchant_id = ?
    """, (body.place_id, body.name, body.lat, body.lon, body.address, body.merchant_id))
    conn.commit()

    return {
        "success": True,
        "merchant_id": body.merchant_id,
        "place_id": body.place_id,
        "name": body.name,
    }
