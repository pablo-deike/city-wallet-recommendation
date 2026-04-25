from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="City Wallet API")

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

class DismissPayload(BaseModel):
    user_id: str
    reason: str | None = None

class UpdateRulesPayload(BaseModel):
    max_discount: int
    quiet_threshold: int
    offer_duration: int


# ── Offer endpoints ───────────────────────────────────────────────────────────

@app.post("/offers/generate")
def generate_offer(ctx: ContextPayload):
    print(f"\n[OFFERS] generate_offer called")
    print(f"  user_id     : {ctx.user_id}")
    print(f"  location    : ({ctx.lat}, {ctx.lon})")
    print(f"  weather     : {ctx.weather}, {ctx.temperature}°C")
    print(f"  → running AI offer engine...")
    print(f"  → nearest merchant: Café Müller (80m)")
    print(f"  → trigger: quiet hours + cold weather match")
    print(f"  → generated: 15% off any hot drink, valid 18 min")
    return {
        "offer_id": "offer_001",
        "merchant": "Café Müller",
        "distance_m": 80,
        "headline": "Cold outside? Your cappuccino is waiting.",
        "discount": "15% off any hot drink",
        "reason": "Quiet right now — offer valid for 18 minutes",
        "valid_minutes": 18,
        "emoji": "☕",
    }


@app.post("/offers/{offer_id}/claim")
def claim_offer(offer_id: str, body: ClaimPayload):
    print(f"\n[OFFERS] claim_offer called")
    print(f"  offer_id : {offer_id}")
    print(f"  user_id  : {body.user_id}")
    print(f"  → generating QR token...")
    print(f"  → QR token: QR-{offer_id.upper()}-{body.user_id.upper()[:6]}")
    print(f"  → offer locked to user, countdown started (17:43)")
    return {
        "qr_token": f"QR-{offer_id.upper()}-{body.user_id.upper()[:6]}",
        "expires_in_seconds": 1063,
        "merchant": "Café Müller",
        "discount": "15% off",
    }


@app.post("/offers/{offer_id}/redeem")
def redeem_offer(offer_id: str, body: RedeemPayload):
    print(f"\n[OFFERS] redeem_offer called")
    print(f"  offer_id  : {offer_id}")
    print(f"  user_id   : {body.user_id}")
    print(f"  qr_token  : {body.qr_token}")
    print(f"  → validating QR token... ✓")
    print(f"  → marking offer as redeemed")
    print(f"  → calculating cashback: 15% of €3.00 = €0.45")
    print(f"  → crediting €0.45 to wallet of {body.user_id}")
    print(f"  → new wallet balance: €2.85")
    return {
        "success": True,
        "cashback_earned": 0.45,
        "new_balance": 2.85,
        "message": "Cashback of €0.45 added to your wallet",
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


# ── Merchant endpoints ────────────────────────────────────────────────────────

@app.get("/merchant/{merchant_id}/stats")
def get_merchant_stats(merchant_id: str):
    print(f"\n[MERCHANT] get_stats called")
    print(f"  merchant_id : {merchant_id}")
    print(f"  → querying offers sent today: 12")
    print(f"  → computing accept rate: 8/12 = 67%")
    print(f"  → summing cashback issued: €5.40")
    return {
        "merchant_id": merchant_id,
        "offers_sent_today": 12,
        "accept_rate": 0.67,
        "cashback_issued": 5.40,
    }


@app.get("/merchant/{merchant_id}/offers")
def get_offer_feed(merchant_id: str):
    print(f"\n[MERCHANT] get_offer_feed called")
    print(f"  merchant_id : {merchant_id}")
    print(f"  → fetching last 5 generated offers")
    return {
        "merchant_id": merchant_id,
        "offers": [
            {"time": "12:41", "offer": "15% off any hot drink",  "status": "Accepted", "distance": "80m"},
            {"time": "12:38", "offer": "10% off lunch special",  "status": "Declined", "distance": "150m"},
            {"time": "12:35", "offer": "20% off pastry + drink", "status": "Accepted", "distance": "45m"},
            {"time": "12:29", "offer": "15% off any hot drink",  "status": "Pending",  "distance": "120m"},
            {"time": "12:22", "offer": "10% off any purchase",   "status": "Accepted", "distance": "60m"},
        ],
    }


@app.get("/merchant/{merchant_id}/rules")
def get_merchant_rules(merchant_id: str):
    print(f"\n[MERCHANT] get_rules called")
    print(f"  merchant_id : {merchant_id}")
    print(f"  → loading active rule config")
    return {
        "merchant_id": merchant_id,
        "max_discount": 20,
        "quiet_threshold": 5,
        "offer_duration": 18,
        "goal": "fill seats during quiet periods",
    }


@app.put("/merchant/{merchant_id}/rules")
def update_merchant_rules(merchant_id: str, body: UpdateRulesPayload):
    print(f"\n[MERCHANT] update_rules called")
    print(f"  merchant_id     : {merchant_id}")
    print(f"  max_discount    : {body.max_discount}%")
    print(f"  quiet_threshold : {body.quiet_threshold} customers/hr")
    print(f"  offer_duration  : {body.offer_duration} minutes")
    print(f"  → validating rule constraints... ✓")
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
