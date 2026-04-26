from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import math
from datetime import datetime

app = FastAPI(title="Vico API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request bodies ────────────────────────────────────────────────────────────

class ContextPayload(BaseModel):
    user_id: str
    lat: float
    lon: float
    weather: str
    temperature: int

class ClaimPayload(BaseModel):
    user_id: str

class RedeemPayload(BaseModel):
    user_id: str
    qr_token: str
    purchase_amount: float = 10.0  # Default purchase amount

class DismissPayload(BaseModel):
    user_id: str
    reason: str | None = None

class UpdateRulesPayload(BaseModel):
    max_discount: int
    quiet_threshold: int
    offer_duration: int


# ── Data stores ──────────────────────────────────────────────────────────────

# Merchant database with locations and rules
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
        "offer_duration": 18,
    },
    "pizza_place": {
        "name": "Pizzeria Napoli",
        "lat": 52.5210,
        "lon": 13.4060,
        "offers": [
            {"type": "quiet_hours", "discount": "10% off lunch special", "emoji": "🍕"},
        ],
        "max_discount": 15,
        "quiet_threshold": 8,
        "offer_duration": 20,
    },
}

# Store active offers to retrieve correct merchant/discount on claim
offers_store = {}

# Track merchant statistics and rules
merchant_stats = {}
merchant_rules = {}

# Track user wallets
user_wallets = {}


# ── Offer endpoints ───────────────────────────────────────────────────────────

@app.post("/offers/generate")
def generate_offer(ctx: ContextPayload):
    
    print(f"\n[OFFERS] generate_offer called")
    print(f"  user_id     : {ctx.user_id}")
    print(f"  location    : ({ctx.lat}, {ctx.lon})")
    print(f"  weather     : {ctx.weather}, {ctx.temperature}°C")
    print(f"  → running AI offer engine...")
    
    # Find nearest merchant based on user location
    nearest_merchant = None
    min_distance = float('inf')
    
    for merchant_id, merchant in merchants_db.items():
        # Calculate distance using Haversine formula (simplified)
        distance = math.sqrt((merchant["lat"] - ctx.lat)**2 + (merchant["lon"] - ctx.lon)**2) * 111  # km to meters
        if distance < min_distance:
            min_distance = distance
            nearest_merchant = (merchant_id, merchant, distance)
    
    if not nearest_merchant:
        return {"error": "No merchants available"}
    
    merchant_id, merchant, distance_m = nearest_merchant
    print(f"  → nearest merchant: {merchant['name']} ({distance_m:.0f}m)")
    
    # Select offer based on context (weather, time, etc.)
    offer_config = None
    trigger_reason = ""
    
    if ctx.temperature < 5 and ctx.weather in ["cloudy", "rainy", "snowy"]:
        offer_config = merchant["offers"][0]  # Cold weather offer
        trigger_reason = "cold weather match"
    else:
        offer_config = merchant["offers"][0]  # Default to first offer
        trigger_reason = "personalized recommendation"
    
    print(f"  → trigger: {trigger_reason}")
    print(f"  → generated: {offer_config['discount']}, valid {merchant['offer_duration']} min")
    
    # Generate unique offer ID
    offer_id = f"offer_{datetime.now().timestamp()}_{ctx.user_id[:4]}"
    
    # Create offer data
    offer_data = {
        "offer_id": offer_id,
        "merchant_id": merchant_id,
        "merchant": merchant["name"],
        "distance_m": int(distance_m),
        "headline": f"{offer_config['emoji']} {merchant['name']} is offering...",
        "discount": offer_config["discount"],
        "reason": f"Quiet right now — offer valid for {merchant['offer_duration']} minutes",
        "valid_minutes": merchant['offer_duration'],
        "emoji": offer_config["emoji"],
        "created_at": datetime.now().isoformat(),
    }
    
    # Store the offer so claim can retrieve it
    offers_store[offer_id] = offer_data
    
    return offer_data


@app.post("/offers/{offer_id}/claim")
def claim_offer(offer_id: str, body: ClaimPayload):
    print(f"\n[OFFERS] claim_offer called")
    print(f"  offer_id : {offer_id}")
    print(f"  user_id  : {body.user_id}")
    
    # Look up the stored offer to get correct merchant and discount
    offer = offers_store.get(offer_id)
    if not offer:
        return {"error": "Offer not found or expired"}
    
    print(f"  → generating QR token...")
    print(f"  → QR token: QR-{offer_id.upper()}-{body.user_id.upper()[:6]}")
    print(f"  → offer locked to user, countdown started (2:00)")
    return {
        "qr_token": f"QR-{offer_id.upper()}-{body.user_id.upper()[:6]}",
        "expires_in_seconds": 120,
        "merchant": offer["merchant"], 
        "discount": offer["discount"],  
    }


@app.post("/offers/{offer_id}/redeem")
def redeem_offer(offer_id: str, body: RedeemPayload):
    print(f"\n[OFFERS] redeem_offer called")
    print(f"  offer_id  : {offer_id}")
    print(f"  user_id   : {body.user_id}")
    print(f"  qr_token  : {body.qr_token}")
    print(f"  purchase_amount: €{body.purchase_amount:.2f}")
    
    # Validate QR token format
    if not body.qr_token.startswith("QR-"):
        return {"error": "Invalid QR token format"}
    
    # Look up the offer
    offer = offers_store.get(offer_id)
    if not offer:
        return {"error": "Offer not found or expired"}
    
    print(f"  → validating QR token... ✓")
    print(f"  → marking offer as redeemed")
    
    # Extract discount percentage from discount string (e.g., "15% off any hot drink" → 15)
    discount_str = offer.get("discount", "0% off")
    try:
        discount_percent = int(discount_str.split("%")[0])
    except (ValueError, IndexError):
        discount_percent = 0
    
    # Calculate cashback
    cashback_earned = (body.purchase_amount * discount_percent) / 100
    
    print(f"  → calculating cashback: {discount_percent}% of €{body.purchase_amount:.2f} = €{cashback_earned:.2f}")
    
    # Get or initialize user wallet
    if body.user_id not in user_wallets:
        user_wallets[body.user_id] = 0.0
    
    old_balance = user_wallets[body.user_id]
    new_balance = old_balance + cashback_earned
    user_wallets[body.user_id] = new_balance
    
    print(f"  → crediting €{cashback_earned:.2f} to wallet of {body.user_id}")
    print(f"  → old balance: €{old_balance:.2f} → new balance: €{new_balance:.2f}")
    
    # Update merchant stats
    merchant_id = offer.get("merchant_id")
    if merchant_id not in merchant_stats:
        merchant_stats[merchant_id] = {
            "offers_sent": 0,
            "offers_accepted": 0,
            "cashback_issued": 0.0,
        }
    
    merchant_stats[merchant_id]["offers_accepted"] += 1
    merchant_stats[merchant_id]["cashback_issued"] += cashback_earned
    
    return {
        "success": True,
        "offer_id": offer_id,
        "merchant": offer.get("merchant"),
        "discount": offer.get("discount"),
        "purchase_amount": body.purchase_amount,
        "cashback_earned": round(cashback_earned, 2),
        "old_balance": round(old_balance, 2),
        "new_balance": round(new_balance, 2),
        "message": f"Cashback of €{cashback_earned:.2f} added to your wallet",
    }


@app.post("/offers/{offer_id}/dismiss")
def dismiss_offer(offer_id: str, body: DismissPayload):
    print(f"\n[OFFERS] dismiss_offer called")
    print(f"  offer_id : {offer_id}")
    print(f"  user_id  : {body.user_id}")
    print(f"  reason   : {body.reason or 'not specified'}")
    print(f"  → logging dismissal signal for ML training")
    print(f"  → scheduling retry with different offer in ~15 min")
    return {"message": "Got it — we'll find a better moment"}


# ── User endpoints ────────────────────────────────────────────────────────────

@app.get("/user/{user_id}/wallet")
def get_user_wallet(user_id: str):
    print(f"\n[USER] get_wallet called")
    print(f"  user_id : {user_id}")
    
    # Get or initialize wallet
    if user_id not in user_wallets:
        user_wallets[user_id] = 0.0
    
    balance = user_wallets[user_id]
    print(f"  → wallet balance: €{balance:.2f}")
    
    return {
        "user_id": user_id,
        "balance": round(balance, 2),
        "currency": "EUR",
    }


# ── Merchant endpoints ────────────────────────────────────────────────────────

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


@app.get("/merchant/{merchant_id}/rules")
def get_merchant_rules(merchant_id: str):
    print(f"\n[MERCHANT] get_rules called")
    print(f"  merchant_id : {merchant_id}")
    
    # Verify merchant exists
    if merchant_id not in merchants_db:
        return {"error": f"Merchant {merchant_id} not found"}
    
    merchant = merchants_db[merchant_id]
    
    # Get current rules (or use defaults from merchants_db)
    if merchant_id not in merchant_rules:
        merchant_rules[merchant_id] = {
            "max_discount": merchant["max_discount"],
            "quiet_threshold": merchant["quiet_threshold"],
            "offer_duration": merchant["offer_duration"],
        }
    
    rules = merchant_rules[merchant_id]
    print(f"  → loading active rule config for {merchant['name']}")
    
    return {
        "merchant_id": merchant_id,
        "merchant_name": merchant["name"],
        "max_discount": rules["max_discount"],
        "quiet_threshold": rules["quiet_threshold"],
        "offer_duration": rules["offer_duration"],
        "goal": "fill seats during quiet periods",
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
