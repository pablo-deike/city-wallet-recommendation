from datetime import datetime
import json
import math
import os
import sqlite3
import uuid
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import httpx
import asyncio

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
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
    get_merchant_special_offers,
    get_merchant_auto_offers,
    get_merchant_auto_offers_by_type,
    create_default_auto_rules,
)

from src.backend import db as google_db

app = FastAPI(title="City Wallet API")

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

conn.commit()

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
            request = Request(details_url, headers={"User-Agent": "Mozilla/5.0"})
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
        request = Request(image_source_url, headers={"User-Agent": "Mozilla/5.0"})
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

    if ctx.temperature < 5:
        discount = f"{max_discount}% off any hot drink"
        emoji = "☕"
        headline = "Warm up nearby"
    else:
        discount = f"{int(max_discount * 0.9)}% off pastry + drink"
        emoji = "🥐"
        headline = "Treat yourself"

    reason = f"Quiet right now - offer valid for {offer_duration} minutes"
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
        "valid_minutes": offer_duration,
        "created_at": created_at,
        "status": "generated",
        "expires_in_seconds": offer_duration * 60,
        "message": f"Offer valid for {offer_duration} minutes",
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

    offers = get_merchant_special_offers(merchant_id)

    offers_data = []
    for offer in offers:
        offers_data.append({
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
        })

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

    special_offers_db[offer_id] = offer

    return {
        "success": True,
        "offer": {
            "offer_id": offer_id,
            "title": offer.title,
            "description": offer.description,
            "discount_percent": offer.discount_percent,
            "product_category": offer.product_category,
            "product_name": offer.product_name,
            "active": offer.active,
        },
    }

@app.put("/merchant/{merchant_id}/special-offers/{offer_id}")
def update_special_offer(merchant_id: str, offer_id: str, body: SpecialOfferUpdate):
    if not merchant_exists(merchant_id):
        return {"error": f"Merchant {merchant_id} not found"}

    if offer_id not in special_offers_db:
        return {"error": f"Offer {offer_id} not found"}

    offer = special_offers_db[offer_id]
    if offer.merchant_id != merchant_id:
        return {"error": f"Offer {offer_id} does not belong to merchant {merchant_id}"}

    if body.title is not None:
        offer.title = body.title
    if body.description is not None:
        offer.description = body.description
    if body.discount_percent is not None:
        offer.discount_percent = body.discount_percent
    if body.product_category is not None:
        offer.product_category = body.product_category
    if body.start_time is not None:
        offer.start_time = body.start_time
    if body.end_time is not None:
        offer.end_time = body.end_time
    if body.max_redemptions is not None:
        offer.max_redemptions = body.max_redemptions
    if body.active is not None:
        offer.active = body.active

    offer.updated_at = datetime.now()

    return {
        "success": True,
        "offer": {
            "offer_id": offer.offer_id,
            "title": offer.title,
            "discount_percent": offer.discount_percent,
            "product_name": offer.product_name,
            "active": offer.active,
        },
    }

@app.delete("/merchant/{merchant_id}/special-offers/{offer_id}")
def delete_special_offer(merchant_id: str, offer_id: str):
    if offer_id not in special_offers_db:
        return {"error": f"Offer {offer_id} not found"}

    offer = special_offers_db[offer_id]
    if offer.merchant_id != merchant_id:
        return {"error": f"Offer {offer_id} does not belong to merchant {merchant_id}"}

    del special_offers_db[offer_id]
    return {"success": True, "deleted": offer_id}


@app.get("/merchant/{merchant_id}/auto-offers")
def get_auto_offers(merchant_id: str):
    if not merchant_exists(merchant_id):
        return {"error": f"Merchant {merchant_id} not found"}

    cursor.execute(
        "SELECT offer_id, rule_type, discount_percent, trigger_config, offer_duration_minutes, product_name, created_at, updated_at FROM auto_offers WHERE merchant_id = ?",
        (merchant_id,)
    )
    rows = cursor.fetchall()

    offers_data = []
    for row in rows:
        offer_id, rule_type, discount_percent, trigger_config_json, offer_duration_minutes, product_name, created_at, updated_at = row
        meta = AUTO_RULE_METADATA.get(AutoRuleType(rule_type), {})
        offers_data.append({
            "offer_id": offer_id,
            "rule_type": rule_type,
            "rule_name": meta.get("name", rule_type),
            "discount_percent": discount_percent,
            "trigger_config": json.loads(trigger_config_json) if trigger_config_json else {},
            "offer_duration_minutes": offer_duration_minutes or 30,
            "product_name": product_name,
            "created_at": created_at,
            "updated_at": updated_at,
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
