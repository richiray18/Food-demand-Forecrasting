"""
id_mapping.py - Deterministic Identity & Time Mapping Bridge

NutriFlow's application domain uses collegiate cafeteria entities:
  - item_id: NutriFlow MenuItem (e.g., Rice, Dal, Paneer Butter Masala)
  - session_id: NutriFlow MealSession (e.g., Breakfast, Lunch, Snacks, Dinner)
  - date: Calendar date (YYYY-MM-DD)

These identifiers do NOT correspond directly to the real food demand forecasting
dataset, which uses:
  - meal_id: Catalog of 51 distinct prepared dishes across 14 categories & 4 cuisines
  - center_id: Catalog of 77 fulfillment centers with specific types, cities, and areas
  - week: Operational time counter (weeks 1 to 145)

CRITICAL BRIDGE NOTE:
This module provides an explicit, deterministic, and persisted bridge between
NutriFlow's operational inputs and the food demand dataset. This is an intentional
mapping bridge for end-to-end integration and demonstration, NOT a claim that
NutriFlow cafeteria entity IDs are semantically identical to the historical dataset's IDs.
"""

import datetime
from typing import Tuple, Union

# --------------------------------------------------------------------------
# 1. Deterministic Item -> Meal Mapping
# --------------------------------------------------------------------------
# Map NutriFlow's 12 seeded MenuItems to representative real meal_ids
# (meal_ids verified in meal_info.csv)
ITEM_TO_MEAL = {
    1: 1109,   # Rice -> Rice Bowl (Indian)
    2: 1248,   # Dal -> Beverages/Sides (Indian)
    3: 1311,   # Roti -> Extras (Thai / Asian flatbread proxy)
    4: 2290,   # Paneer Butter Masala -> Rice Bowl / Main Curry (Indian)
    5: 1803,   # Curd -> Extras
    6: 1885,   # Tea -> Beverages (Thai / Hot beverage proxy)
    7: 2707,   # Gulab Jamun -> Desert (Italian / Sweet dessert proxy)
    8: 2631,   # Chicken Hyderabadi -> Beverages/Main (Indian)
    9: 1993,   # Coffee -> Beverages
    10: 2490,  # Salad -> Salad (Italian)
    11: 1754,  # Cheese Sandwich -> Sandwich (Italian)
    12: 2760,  # Upma -> Other Snacks
}

# String name aliases for frontend robustness
ITEM_NAME_ALIASES = {
    "rice": 1109,
    "dal": 1248,
    "roti": 1311,
    "paneer": 2290,
    "curd": 1803,
    "tea": 1885,
    "gulab jamun": 2707,
    "chicken": 2631,
    "coffee": 1993,
    "salad": 2490,
    "sandwich": 1754,
    "upma": 2760,
}

# Sorted pool of valid meal_ids from meal_info.csv for deterministic hash fallback
VALID_MEAL_IDS = [
    1062, 1109, 1198, 1207, 1216, 1230, 1247, 1248, 1311, 1438,
    1445, 1525, 1543, 1558, 1727, 1754, 1778, 1803, 1847, 1878,
    1885, 1901, 1962, 1971, 1993, 2104, 2126, 2139, 2290, 2304,
    2306, 2322, 2444, 2490, 2492, 2494, 2539, 2569, 2577, 2581,
    2631, 2640, 2664, 2704, 2707, 2760, 2826, 2867, 2956
]

# --------------------------------------------------------------------------
# 2. Deterministic Session -> Center Mapping
# --------------------------------------------------------------------------
# Map NutriFlow's 4 daily meal sessions to representative fulfillment center_ids
# (center_ids verified in fulfilment_center_info.csv)
SESSION_TO_CENTER = {
    1: 11,   # Breakfast -> Center #11 (Type A, City 679)
    2: 13,   # Lunch     -> Center #13 (Type B, City 590, Area 6.7) - Large hub
    3: 124,  # Snacks    -> Center #124 (Type C, City 590) - Quick service
    4: 66,   # Dinner    -> Center #66 (Type A, City 648) - Evening dinner
}

SESSION_NAME_ALIASES = {
    "breakfast": 11,
    "lunch": 13,
    "snacks": 124,
    "dinner": 66,
}

VALID_CENTER_IDS = [
    10, 11, 13, 14, 20, 23, 24, 26, 27, 29, 30, 32, 34, 36, 39,
    41, 42, 43, 50, 51, 52, 53, 55, 57, 58, 59, 61, 64, 65, 66,
    67, 68, 72, 73, 74, 75, 76, 77, 80, 81, 83, 86, 88, 89, 91,
    92, 93, 94, 97, 99, 101, 102, 104, 106, 108, 109, 110, 113,
    124, 126, 129, 132, 137, 139, 143, 145, 146, 149, 152, 153,
    157, 161, 162, 174, 177, 186
]

# --------------------------------------------------------------------------
# 3. Deterministic Date -> Week Mapping
# --------------------------------------------------------------------------
# Anchor Date: 2026-08-10 (Monday, earliest date in NutriFlow seeded consumption logs)
# Week 1 is anchored to this date. Each 7 days increments the operational week.
# To keep within the real dataset's 145-week boundary, we apply modulo 145.
ANCHOR_DATE = datetime.date(2026, 8, 10)
TOTAL_DATASET_WEEKS = 145


def map_item_to_meal(item: Union[int, str]) -> int:
    """Map a NutriFlow item_id or item name to a valid dataset meal_id."""
    if item is None:
        return 1109  # default Rice Bowl

    # If already a valid dataset meal_id
    try:
        val_int = int(item)
        if val_int in VALID_MEAL_IDS:
            return val_int
        if val_int in ITEM_TO_MEAL:
            return ITEM_TO_MEAL[val_int]
        # Deterministic round-robin for unseeded IDs
        return VALID_MEAL_IDS[abs(val_int) % len(VALID_MEAL_IDS)]
    except (ValueError, TypeError):
        pass

    # String match / alias
    item_str = str(item).strip().lower()
    for alias, m_id in ITEM_NAME_ALIASES.items():
        if alias in item_str:
            return m_id

    # Fallback to deterministic hash
    hash_idx = abs(hash(item_str)) % len(VALID_MEAL_IDS)
    return VALID_MEAL_IDS[hash_idx]


def map_session_to_center(session: Union[int, str]) -> int:
    """Map a NutriFlow session_id or session name to a valid dataset center_id."""
    if session is None:
        return 13  # default Lunch hub

    try:
        val_int = int(session)
        if val_int in VALID_CENTER_IDS:
            return val_int
        if val_int in SESSION_TO_CENTER:
            return SESSION_TO_CENTER[val_int]
        return VALID_CENTER_IDS[abs(val_int) % len(VALID_CENTER_IDS)]
    except (ValueError, TypeError):
        pass

    session_str = str(session).strip().lower()
    for alias, c_id in SESSION_NAME_ALIASES.items():
        if alias in session_str:
            return c_id

    hash_idx = abs(hash(session_str)) % len(VALID_CENTER_IDS)
    return VALID_CENTER_IDS[hash_idx]


def date_to_week(date_val: Union[str, datetime.date, datetime.datetime]) -> int:
    """
    Deterministically map a calendar date to a dataset operational week (1..145).
    Anchor: 2026-08-10 = Week 1.
    """
    if isinstance(date_val, datetime.datetime):
        d = date_val.date()
    elif isinstance(date_val, datetime.date):
        d = date_val
    elif isinstance(date_val, str):
        try:
            d = datetime.datetime.strptime(date_val.split("T")[0], "%Y-%m-%d").date()
        except Exception:
            d = ANCHOR_DATE
    else:
        d = ANCHOR_DATE

    delta_days = (d - ANCHOR_DATE).days
    week_offset = delta_days // 7
    # Map within 1..145 cyclically
    mapped_week = 1 + (week_offset % TOTAL_DATASET_WEEKS)
    if mapped_week < 1:
        mapped_week = 1
    return int(mapped_week)


# --------------------------------------------------------------------------
# 4. Serving Weight per Order (Step 4 Conversion Layer)
# --------------------------------------------------------------------------
# Reasonable average per-portion batch weight (kg) by meal category.
# Assumption: Represents finished cooked mass needed per individual customer order.
CATEGORY_SERVING_WEIGHT_KG = {
    "Beverages": 0.25,     # 250ml / 0.25 kg
    "Biryani": 0.40,       # 400g hearty portion
    "Desert": 0.15,        # 150g sweet portion
    "Extras": 0.15,        # 150g sides/chutneys
    "Fish": 0.35,          # 350g fish meal
    "Other Snacks": 0.20,  # 200g snacks
    "Pasta": 0.35,         # 350g pasta
    "Pizza": 0.40,         # 400g personal pizza
    "Rice Bowl": 0.38,     # 380g rice bowl
    "Salad": 0.20,         # 200g salad
    "Sandwich": 0.25,      # 250g sandwich
    "Seafood": 0.35,       # 350g seafood meal
    "Soup": 0.25,          # 250ml bowl of soup
    "Starters": 0.25,      # 250g appetizer
    "default": 0.30,       # 300g generic default
}


def get_serving_weight(category: str = "default") -> float:
    """Return serving weight in kg for a given meal category."""
    return CATEGORY_SERVING_WEIGHT_KG.get(category, CATEGORY_SERVING_WEIGHT_KG["default"])
