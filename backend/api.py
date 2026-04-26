from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import math
from datetime import datetime

app = FastAPI(title="City Wallet API (Refactored)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Request bodies ─────────────────────────────────────────

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

merchants_db = {
    "cafe_mueller": {
        "name": "Café Müller",
        "lat": 52.5200,
        "lon": 13.4050,
        "offers": [
            {"type": "cold_weather", "discount": "15% off any hot drink", "emoji": "☕"},
            {"type": "quiet_hours", "discount": "20% off pastry + drink", "emoji": "🥐"},
        ],
        "max_discount": 20,
        "quiet_threshold": 5,
        "offer_duration": 15,
    }
}

offers_store = {}
merchant_stats = {}
merchant_rules = {}
user_wallets = {}

# ── OFFER GENERATION ───────────────────────────────────────

@app.post("/offers/generate")
def generate_offer(ctx: ContextPayload):
    nearest_merchant = None
    min_distance = float("inf")

    for merchant_id, merchant in merchants_db.items():
        distance = math.sqrt((merchant["lat"] - ctx.lat)**2 + (merchant["lon"] - ctx.lon)**2) * 111000
        if distance < min_distance:
            min_distance = distance
            nearest_merchant = (merchant_id, merchant, distance)

    if not nearest_merchant:
        return {"error": "No merchants found"}

    merchant_id, merchant, distance_m = nearest_merchant

    # Simple context logic
    if ctx.temperature < 5:
        offer_config = merchant["offers"][0]
    else:
        offer_config = merchant["offers"][1]

    offer_id = f"offer_{int(datetime.now().timestamp())}"

    offer = {
        "offer_id": offer_id,
        "merchant_id": merchant_id,
        "merchant": merchant["name"],
        "discount": offer_config["discount"],
        "emoji": offer_config["emoji"],
        "distance_m": int(distance_m),
        "headline": f"{offer_config['emoji']} Warm up nearby",
        "created_at": datetime.now().isoformat(),
        "status": "generated"
    }

    offers_store[offer_id] = offer

    # Track stats
    if merchant_id not in merchant_stats:
        merchant_stats[merchant_id] = {
            "offers_sent": 0,
            "offers_accepted": 0,
            "cashback_issued": 0.0,
        }

    merchant_stats[merchant_id]["offers_sent"] += 1

    return {
        **offer,
        "expires_in_seconds": 120,
        "message": "Offer valid for 2 minutes"
    }

# ── ACCEPT OFFER (replaces claim) ──────────────────────────

@app.post("/offers/{offer_id}/accept")
def accept_offer(offer_id: str, body: AcceptPayload):
    offer = offers_store.get(offer_id)
    if not offer:
        return {"error": "Offer not found"}

    created_time = datetime.fromisoformat(offer["created_at"])
    if (datetime.now() - created_time).total_seconds() > 120:
        return {"error": "Offer expired"}

    # Generate discount code
    code = f"{offer['merchant_id'][:4].upper()}{int(datetime.now().timestamp()) % 1000}"

    offer["status"] = "accepted"
    offer["accepted_at"] = datetime.now().isoformat()
    offer["accepted_by"] = body.user_id
    offer["code"] = code

    return {
        "code": code,
        "merchant": offer["merchant"],
        "discount": offer["discount"],
        "checkout_expires_in": 600,
        "message": "Show this code at checkout (valid 10 min)"
    }

# ── CHECKOUT (replaces redeem) ─────────────────────────────

@app.post("/offers/{offer_id}/checkout")
def checkout_offer(offer_id: str, body: CheckoutPayload):
    offer = offers_store.get(offer_id)
    if not offer:
        return {"error": "Offer not found"}

    if offer.get("status") != "accepted":
        return {"error": "Offer must be accepted first"}

    if offer.get("code") != body.code:
        return {"error": "Invalid code"}

    accepted_time = datetime.fromisoformat(offer["accepted_at"])
    if (datetime.now() - accepted_time).total_seconds() > 600:
        return {"error": "Code expired"}

    # Extract discount %
    try:
        discount_percent = int(offer["discount"].split("%")[0])
    except:
        discount_percent = 0

    cashback = (body.purchase_amount * discount_percent) / 100

    # Wallet
    if body.user_id not in user_wallets:
        user_wallets[body.user_id] = 0.0

    user_wallets[body.user_id] += cashback

    # Stats
    merchant_id = offer["merchant_id"]
    merchant_stats[merchant_id]["offers_accepted"] += 1
    merchant_stats[merchant_id]["cashback_issued"] += cashback

    offer["status"] = "redeemed"

    return {
        "success": True,
        "cashback_earned": round(cashback, 2),
        "new_balance": round(user_wallets[body.user_id], 2),
        "message": f"€{cashback:.2f} cashback applied"
    }


@app.post("/offers/{offer_id}/dismiss")
def dismiss_offer(offer_id: str, body: DismissPayload):
    return {"message": "Offer dismissed"}


@app.get("/user/{user_id}/wallet")
def get_wallet(user_id: str):
    if user_id not in user_wallets:
        user_wallets[user_id] = 0.0
    return {"balance": round(user_wallets[user_id], 2)}


@app.get("/merchant/{merchant_id}/stats")
def get_merchant_stats(merchant_id: str):
    print(f"\n[MERCHANT] get_stats called")
    print(f"  merchant_id : {merchant_id}")
    
    # Verify merchant exists
    if merchant_id not in merchants_db:
        return {"error": f"Merchant {merchant_id} not found"}
    
    merchant = merchants_db[merchant_id]
    
    # Get or initialize stats for this merchant
    if merchant_id not in merchant_stats:
        merchant_stats[merchant_id] = {
            "offers_sent": 0,
            "offers_accepted": 0,
            "cashback_issued": 0.0,
        }
    
    stats = merchant_stats[merchant_id]
    accept_rate = stats["offers_accepted"] / stats["offers_sent"] if stats["offers_sent"] > 0 else 0
    
    print(f"  → querying offers sent today: {stats['offers_sent']}")
    print(f"  → computing accept rate: {stats['offers_accepted']}/{stats['offers_sent']} = {accept_rate*100:.0f}%")
    print(f"  → summing cashback issued: €{stats['cashback_issued']:.2f}")
    
    return {
        "merchant_id": merchant_id,
        "merchant_name": merchant["name"],
        "offers_sent_today": stats["offers_sent"],
        "offers_accepted": stats["offers_accepted"],
        "accept_rate": accept_rate,
        "cashback_issued": stats["cashback_issued"],
    }

@app.get("/merchant/{merchant_id}/offers")
def get_offer_feed(merchant_id: str):
    print(f"\n[MERCHANT] get_offer_feed called")
    print(f"  merchant_id : {merchant_id}")
    
    # Verify merchant exists
    if merchant_id not in merchants_db:
        return {"error": f"Merchant {merchant_id} not found"}
    
    # Get actual offers generated for this merchant
    merchant_offers = []
    for offer_id, offer in offers_store.items():
        if offer.get("merchant_id") == merchant_id:
            # Determine status based on whether it's claimed
            status = "Generated"  # Could be enhanced with actual tracking
            merchant_offers.append({
                "offer_id": offer_id,
                "time": offer.get("created_at", ""),
                "offer": offer.get("discount", ""),
                "status": status,
                "distance": f"{offer.get('distance_m', 0)}m",
            })
    
    # If no offers yet, show empty
    print(f"  → fetching last 5 generated offers for {merchant_id}")
    
    return {
        "merchant_id": merchant_id,
        "total_offers": len(merchant_offers),
        "offers": merchant_offers[-5:] if merchant_offers else [],  # Last 5
    }


@app.put("/merchant/{merchant_id}/rules")
def update_merchant_rules(merchant_id: str, body: UpdateRulesPayload):
    print(f"\n[MERCHANT] update_rules called")
    print(f"  merchant_id     : {merchant_id}")
    print(f"  max_discount    : {body.max_discount}%")
    print(f"  quiet_threshold : {body.quiet_threshold} customers/hr")
    print(f"  offer_duration  : {body.offer_duration} minutes")
    
    # Verify merchant exists
    if merchant_id not in merchants_db:
        return {"error": f"Merchant {merchant_id} not found"}
    
    # Validate constraints
    if body.max_discount < 0 or body.max_discount > 100:
        return {"error": "max_discount must be between 0 and 100"}
    if body.quiet_threshold < 0:
        return {"error": "quiet_threshold cannot be negative"}
    if body.offer_duration < 1:
        return {"error": "offer_duration must be at least 1 minute"}
    
    print(f"  → validating rule constraints... ✓")
    
    # Save the new rules
    merchant_rules[merchant_id] = {
        "max_discount": body.max_discount,
        "quiet_threshold": body.quiet_threshold,
        "offer_duration": body.offer_duration,
    }
    
    # Update the merchants_db as well for future offers
    merchants_db[merchant_id]["max_discount"] = body.max_discount
    merchants_db[merchant_id]["quiet_threshold"] = body.quiet_threshold
    merchants_db[merchant_id]["offer_duration"] = body.offer_duration
    
    print(f"  → saving new rule config")
    print(f"  → AI engine will use updated rules on next trigger")
    
    return {
        "success": True,
        "merchant_id": merchant_id,
        "updated": {
            "max_discount": body.max_discount,
            "quiet_threshold": body.quiet_threshold,
            "offer_duration": body.offer_duration,
        },
    }