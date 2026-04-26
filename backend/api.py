from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sqlite3
from datetime import datetime
import math
import json

app = FastAPI(title="City Wallet API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ───────────────────────────────────────────────────────────
# DATABASE SETUP
# ───────────────────────────────────────────────────────────

conn = sqlite3.connect("city_wallet.db", check_same_thread=False)
cursor = conn.cursor()

# Merchants
cursor.execute("""
CREATE TABLE IF NOT EXISTS merchants (
    merchant_id TEXT PRIMARY KEY,
    name TEXT,
    lat REAL,
    lon REAL,
    max_discount INTEGER,
    quiet_threshold INTEGER,
    offer_duration INTEGER
)
""")

# Offers
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

# Wallets
cursor.execute("""
CREATE TABLE IF NOT EXISTS wallets (
    user_id TEXT PRIMARY KEY,
    balance REAL
)
""")

# Merchant stats
cursor.execute("""
CREATE TABLE IF NOT EXISTS merchant_stats (
    merchant_id TEXT PRIMARY KEY,
    offers_sent INTEGER DEFAULT 0,
    offers_accepted INTEGER DEFAULT 0,
    cashback_issued REAL DEFAULT 0.0,
    FOREIGN KEY(merchant_id) REFERENCES merchants(merchant_id)
)
""")

conn.commit()

# ───────────────────────────────────────────────────────────
# REQUEST MODELS
# ───────────────────────────────────────────────────────────

class ContextPayload(BaseModel):
    user_id: str
    lat: float
    lon: float
    weather: str
    temperature: int

class AcceptPayload(BaseModel):
    user_id: str

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

# ───────────────────────────────────────────────────────────
# INITIALIZATION: Seed default merchant (Café Müller)
# ───────────────────────────────────────────────────────────

cursor.execute("SELECT COUNT(*) FROM merchants")
if cursor.fetchone()[0] == 0:
    cursor.execute("""
    INSERT INTO merchants (merchant_id, name, lat, lon, max_discount, quiet_threshold, offer_duration)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, ("cafe_mueller", "Café Müller", 52.5200, 13.4050, 20, 5, 15))
    
    cursor.execute("""
    INSERT INTO merchant_stats (merchant_id, offers_sent, offers_accepted, cashback_issued)
    VALUES (?, 0, 0, 0.0)
    """, ("cafe_mueller",))
    
    conn.commit()

# ───────────────────────────────────────────────────────────
# OFFER GENERATION ENGINE
# ───────────────────────────────────────────────────────────

@app.post("/offers/generate")
def generate_offer(ctx: ContextPayload):
    # Get all merchants from DB
    cursor.execute("""
    SELECT merchant_id, name, lat, lon, max_discount, quiet_threshold, offer_duration
    FROM merchants
    """)
    merchants = cursor.fetchall()
    
    if not merchants:
        return {"error": "No merchants found"}

    # Find nearest merchant
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

    # Simple context logic
    if ctx.temperature < 5:
        discount = f"{max_discount}% off any hot drink"
        emoji = "☕"
        headline = "☕ Warm up nearby"
    else:
        discount = f"{int(max_discount * 0.9)}% off pastry + drink"
        emoji = "🥐"
        headline = "🥐 Treat yourself"

    offer_id = f"offer_{int(datetime.now().timestamp())}"
    created_at = datetime.now().isoformat()
    
    # Store in DB
    cursor.execute("""
    INSERT INTO offers (offer_id, merchant_id, discount, emoji, distance_m, headline, created_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (offer_id, merchant_id, discount, emoji, int(distance_m), headline, created_at, "generated"))
    
    # Update stats
    cursor.execute("""
    UPDATE merchant_stats SET offers_sent = offers_sent + 1 WHERE merchant_id = ?
    """, (merchant_id,))
    
    conn.commit()

    return {
        "offer_id": offer_id,
        "merchant_id": merchant_id,
        "merchant": name,
        "discount": discount,
        "emoji": emoji,
        "distance_m": int(distance_m),
        "headline": headline,
        "created_at": created_at,
        "status": "generated",
        "expires_in_seconds": 120,
        "message": "Offer valid for 2 minutes"
    }

# ───────────────────────────────────────────────────────────
# ACCEPT OFFER
# ───────────────────────────────────────────────────────────

@app.post("/offers/{offer_id}/accept")
def accept_offer(offer_id: str, body: AcceptPayload):
    cursor.execute("""
    SELECT offer_id, merchant_id, discount, created_at, status
    FROM offers WHERE offer_id = ?
    """, (offer_id,))
    row = cursor.fetchone()

    if not row:
        return {"error": "Offer not found"}

    offer_id_db, merchant_id, discount, created_at, status = row

    # Check expiration (2 minutes)
    created_time = datetime.fromisoformat(created_at)
    if (datetime.now() - created_time).total_seconds() > 120:
        return {"error": "Offer expired"}

    # Generate code
    code = f"{merchant_id[:4].upper()}{int(datetime.now().timestamp()) % 1000}"

    # Update offer
    cursor.execute("""
    UPDATE offers SET status = ?, accepted_at = ?, user_id = ?, code = ?
    WHERE offer_id = ?
    """, ("accepted", datetime.now().isoformat(), body.user_id, code, offer_id))

    conn.commit()

    # Get merchant name
    cursor.execute("SELECT name FROM merchants WHERE merchant_id = ?", (merchant_id,))
    merchant_name = cursor.fetchone()[0]

    return {
        "code": code,
        "merchant": merchant_name,
        "discount": discount,
        "checkout_expires_in": 600,
        "message": "Show this code at checkout (valid 10 min)"
    }

# ───────────────────────────────────────────────────────────
# CHECKOUT
# ───────────────────────────────────────────────────────────

@app.post("/offers/{offer_id}/checkout")
def checkout_offer(offer_id: str, body: CheckoutPayload):
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

    if code != body.code:
        return {"error": "Invalid code"}

    # Check code expiration (10 minutes)
    accepted_time = datetime.fromisoformat(accepted_at)
    if (datetime.now() - accepted_time).total_seconds() > 600:
        return {"error": "Code expired"}

    # Extract discount %
    try:
        discount_percent = int(discount.split("%")[0])
    except:
        discount_percent = 0

    cashback = (body.purchase_amount * discount_percent) / 100

    # Update wallet
    cursor.execute("""
    INSERT INTO wallets (user_id, balance)
    VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET balance = balance + ?
    """, (body.user_id, cashback, cashback))

    # Update merchant stats
    cursor.execute("""
    UPDATE merchant_stats 
    SET offers_accepted = offers_accepted + 1, cashback_issued = cashback_issued + ?
    WHERE merchant_id = ?
    """, (cashback, merchant_id))

    # Mark offer as redeemed
    cursor.execute("UPDATE offers SET status = ? WHERE offer_id = ?", ("redeemed", offer_id))

    conn.commit()

    # Get new balance
    cursor.execute("SELECT balance FROM wallets WHERE user_id = ?", (body.user_id,))
    balance = cursor.fetchone()[0]

    return {
        "success": True,
        "cashback_earned": round(cashback, 2),
        "new_balance": round(balance, 2),
        "message": f"€{cashback:.2f} cashback applied"
    }

# ───────────────────────────────────────────────────────────
# DISMISS OFFER
# ───────────────────────────────────────────────────────────

@app.post("/offers/{offer_id}/dismiss")
def dismiss_offer(offer_id: str, body: DismissPayload):
    cursor.execute("UPDATE offers SET status = ? WHERE offer_id = ?", ("dismissed", offer_id))
    conn.commit()
    return {"message": "Offer dismissed"}

# ───────────────────────────────────────────────────────────
# WALLET
# ───────────────────────────────────────────────────────────

@app.get("/user/{user_id}/wallet")
def get_wallet(user_id: str):
    cursor.execute("SELECT balance FROM wallets WHERE user_id = ?", (user_id,))
    row = cursor.fetchone()
    balance = row[0] if row else 0.0
    return {"balance": round(balance, 2)}

# ───────────────────────────────────────────────────────────
# MERCHANT STATS
# ───────────────────────────────────────────────────────────

@app.get("/merchant/{merchant_id}/stats")
def get_merchant_stats(merchant_id: str):
    # Verify merchant exists
    cursor.execute("SELECT name FROM merchants WHERE merchant_id = ?", (merchant_id,))
    merchant_row = cursor.fetchone()
    
    if not merchant_row:
        return {"error": f"Merchant {merchant_id} not found"}
    
    merchant_name = merchant_row[0]
    
    # Get stats
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

# ───────────────────────────────────────────────────────────
# MERCHANT OFFERS FEED
# ───────────────────────────────────────────────────────────

@app.get("/merchant/{merchant_id}/offers")
def get_offer_feed(merchant_id: str):
    # Verify merchant exists
    cursor.execute("SELECT name FROM merchants WHERE merchant_id = ?", (merchant_id,))
    if not cursor.fetchone():
        return {"error": f"Merchant {merchant_id} not found"}
    
    # Get last 5 offers
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

# ───────────────────────────────────────────────────────────
# UPDATE MERCHANT RULES
# ───────────────────────────────────────────────────────────

@app.put("/merchant/{merchant_id}/rules")
def update_merchant_rules(merchant_id: str, body: UpdateRulesPayload):
    # Verify merchant exists
    cursor.execute("SELECT name FROM merchants WHERE merchant_id = ?", (merchant_id,))
    if not cursor.fetchone():
        return {"error": f"Merchant {merchant_id} not found"}
    
    # Validate constraints
    if body.max_discount < 0 or body.max_discount > 100:
        return {"error": "max_discount must be between 0 and 100"}
    if body.quiet_threshold < 0:
        return {"error": "quiet_threshold cannot be negative"}
    if body.offer_duration < 1:
        return {"error": "offer_duration must be at least 1 minute"}
    
    # Update merchant rules
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

# ───────────────────────────────────────────────────────────
# CREATE MERCHANT (bonus endpoint)
# ───────────────────────────────────────────────────────────

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
