from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel


class AutoRuleType(str, Enum):
    FIRST_VISIT = "first_visit"
    LOYALTY_REWARD = "loyalty_reward"
    QUIET_HOUR = "quiet_hour"
    WEATHER_MATCH = "weather_match"


class TriggerSource(str, Enum):
    USER_HISTORY = "user_history"
    CONTEXT = "context"


class LoyaltyRewardType(str, Enum):
    PERCENT_DISCOUNT = "percent_discount"
    FREEBIE = "freebie"


class WeatherTriggerType(str, Enum):
    COLD = "cold"
    RAIN = "rain"
    HOT = "hot"


class AutoRule(BaseModel):
    rule_id: str
    merchant_id: str
    rule_type: AutoRuleType
    enabled: bool = True
    discount_percent: int
    trigger_config: dict
    offer_duration_minutes: int = 30
    created_at: datetime
    updated_at: datetime


class AutoRuleCreate(BaseModel):
    rule_type: AutoRuleType
    enabled: bool = True
    discount_percent: int
    trigger_config: dict
    offer_duration_minutes: Optional[int] = None


class AutoRuleUpdate(BaseModel):
    enabled: Optional[bool] = None
    discount_percent: Optional[int] = None
    trigger_config: Optional[dict] = None
    offer_duration_minutes: Optional[int] = None


class SpecialOffer(BaseModel):
    offer_id: str
    merchant_id: str
    title: str
    description: str
    discount_percent: int
    product_category: str
    product_name: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    max_redemptions: Optional[int] = None
    redemptions_count: int = 0
    active: bool = True
    created_at: datetime
    updated_at: datetime


class SpecialOfferCreate(BaseModel):
    title: str
    description: str
    discount_percent: int
    product_category: str
    product_name: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    max_redemptions: Optional[int] = None


class SpecialOfferUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    discount_percent: Optional[int] = None
    product_category: Optional[str] = None
    product_name: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    max_redemptions: Optional[int] = None
    active: Optional[bool] = None


class AutoOfferInstance(BaseModel):
    offer_id: str
    merchant_id: str
    rule_type: AutoRuleType
    discount_percent: int
    trigger_config: dict
    offer_duration_minutes: int = 30
    product_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AutoOfferCreate(BaseModel):
    rule_type: AutoRuleType
    discount_percent: int
    trigger_config: dict
    offer_duration_minutes: Optional[int] = None
    product_name: Optional[str] = None


AUTO_RULE_DEFAULTS = {
    AutoRuleType.FIRST_VISIT: {
        "trigger_config": {},
        "discount_percent": 10,
        "description": "User has never transacted at this merchant",
        "offer_duration_minutes": 30,
    },
    AutoRuleType.LOYALTY_REWARD: {
        "trigger_config": {
            "visit_count": 5,
            "reward_type": "percent_discount",
            "reward_product": "",
        },
        "discount_percent": 15,
        "description": "Nth visit triggers reward",
        "offer_duration_minutes": 30,
    },
    AutoRuleType.QUIET_HOUR: {
        "trigger_config": {"density_threshold": 5},
        "discount_percent": 15,
        "description": "Low Payone density - auto discount to drive traffic",
        "offer_duration_minutes": 30,
    },
    AutoRuleType.WEATHER_MATCH: {
        "trigger_config": {
            "cold_enabled": False,
            "cold_temp_c": 5,
            "cold_discount_percent": 10,
            "cold_product": "",
            "rain_enabled": False,
            "rain_discount_percent": 10,
            "rain_product": "",
            "hot_enabled": False,
            "hot_temp_c": 25,
            "hot_discount_percent": 10,
            "hot_product": "",
        },
        "discount_percent": 10,
        "description": "Weather-based offers (cold, rain, hot)",
        "offer_duration_minutes": 30,
    },
}

AUTO_RULE_METADATA = {
    AutoRuleType.FIRST_VISIT: {
        "name": "First Visit",
        "trigger_source": TriggerSource.USER_HISTORY,
        "description": "User has never transacted at this merchant before",
    },
    AutoRuleType.LOYALTY_REWARD: {
        "name": "Loyalty Reward",
        "trigger_source": TriggerSource.USER_HISTORY,
        "description": "Nth visit triggers reward",
    },
    AutoRuleType.QUIET_HOUR: {
        "name": "Quiet Hour Fill",
        "trigger_source": TriggerSource.CONTEXT,
        "description": "Low Payone density - auto discount to drive traffic",
    },
    AutoRuleType.WEATHER_MATCH: {
        "name": "Weather Match",
        "trigger_source": TriggerSource.CONTEXT,
        "description": "Weather-based offers (cold, rain, hot)",
    },
}


auto_rules_db: dict[str, AutoRule] = {}
special_offers_db: dict[str, SpecialOffer] = {}
auto_offers_db: dict[str, AutoOfferInstance] = {}
user_transaction_history: dict[str, dict[str, int]] = {}


def get_merchant_auto_rules(merchant_id: str) -> list[AutoRule]:
    return [r for r in auto_rules_db.values() if r.merchant_id == merchant_id]


def get_merchant_special_offers(merchant_id: str) -> list[SpecialOffer]:
    return [o for o in special_offers_db.values() if o.merchant_id == merchant_id]


def get_merchant_auto_offers(merchant_id: str) -> list[AutoOfferInstance]:
    return [o for o in auto_offers_db.values() if o.merchant_id == merchant_id]


def get_merchant_auto_offers_by_type(merchant_id: str, rule_type: AutoRuleType) -> list[AutoOfferInstance]:
    return [o for o in auto_offers_db.values() if o.merchant_id == merchant_id and o.rule_type == rule_type]


def create_default_auto_rules(merchant_id: str) -> list[AutoRule]:
    import uuid
    rules = []
    now = datetime.now()
    for rule_type in AutoRuleType:
        rule_id = f"auto_{merchant_id}_{rule_type.value}_{uuid.uuid4().hex[:8]}"
        defaults = AUTO_RULE_DEFAULTS[rule_type]
        rule = AutoRule(
            rule_id=rule_id,
            merchant_id=merchant_id,
            rule_type=rule_type,
            enabled=True,
            discount_percent=defaults["discount_percent"],
            trigger_config=defaults["trigger_config"],
            offer_duration_minutes=defaults.get("offer_duration_minutes", 30),
            created_at=now,
            updated_at=now,
        )
        auto_rules_db[rule_id] = rule
        rules.append(rule)
    return rules


def evaluate_auto_rules(
    merchant_id: str,
    user_id: str,
    context: dict,
) -> list[AutoRule]:
    rules = get_merchant_auto_rules(merchant_id)
    if not rules:
        rules = create_default_auto_rules(merchant_id)
    
    matching_rules = []
    for rule in rules:
        if not rule.enabled:
            continue
        
        if rule.rule_type == AutoRuleType.FIRST_VISIT:
            tx_history = user_transaction_history.get(user_id, {})
            if merchant_id not in tx_history or tx_history[merchant_id] == 0:
                matching_rules.append(rule)
        
        elif rule.rule_type == AutoRuleType.LOYALTY_REWARD:
            tx_history = user_transaction_history.get(user_id, {})
            visit_count = tx_history.get(merchant_id, 0)
            nth_visit = rule.trigger_config.get("visit_count", 5)
            if visit_count > 0 and visit_count % nth_visit == 0:
                matching_rules.append(rule)
        
        elif rule.rule_type == AutoRuleType.QUIET_HOUR:
            density = context.get("payone_density", 10)
            threshold = rule.trigger_config.get("density_threshold", 5)
            if density < threshold:
                matching_rules.append(rule)
        
        elif rule.rule_type == AutoRuleType.WEATHER_MATCH:
            temp = context.get("temperature", 15)
            precip = context.get("precipitation_mm", 0)
            
            cfg = rule.trigger_config
            if cfg.get("cold_enabled") and temp < cfg.get("cold_temp_c", 5):
                matching_rules.append(rule)
            elif cfg.get("rain_enabled") and precip > 0:
                matching_rules.append(rule)
            elif cfg.get("hot_enabled") and temp > cfg.get("hot_temp_c", 25):
                matching_rules.append(rule)
    
    return matching_rules


def evaluate_special_offers(
    merchant_id: str,
    context: dict,
) -> list[SpecialOffer]:
    offers = get_merchant_special_offers(merchant_id)
    now = datetime.now()
    
    active_offers = []
    for offer in offers:
        if not offer.active:
            continue
        if offer.start_time and now < offer.start_time:
            continue
        if offer.end_time and now > offer.end_time:
            continue
        if offer.max_redemptions and offer.redemptions_count >= offer.max_redemptions:
            continue
        active_offers.append(offer)
    
    return active_offers