"""
predict.py - Real-Time Inference Layer Using Trained XGBoost Model

Implements the contract for NutriFlow demand forecasting:
1. Maps NutriFlow (item_id, session_id, date) -> (meal_id, center_id, week) using id_mapping.py.
2. Extracts domain features & historical demand lags for the target meal & center.
3. Performs inference with the saved XGBoost model -> predicted_orders.
4. Step 4 Recommendation Layer: Converts predicted_orders -> baseline_kg via serving weight.
5. Applies operational multipliers (holiday x0.35, exam x0.90, adverse weather x0.90) -> recommended_quantity_prepared_kg.
6. Returns the exact JSON structure expected by NutriFlow's frontend.
"""

import os
import sys
import numpy as np
import pandas as pd
import joblib
from datetime import datetime
from typing import Dict, Any, Union

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

try:
    from .id_mapping import map_item_to_meal, map_session_to_center, date_to_week, get_serving_weight
    from .model import adjust_for_conditions, orders_to_prep_kg
except (ImportError, ValueError):
    from id_mapping import map_item_to_meal, map_session_to_center, date_to_week, get_serving_weight
    from model import adjust_for_conditions, orders_to_prep_kg

MODEL_JOBLIB_PATH = os.path.join(BASE_DIR, "model.joblib")
METADATA_JOBLIB_PATH = os.path.join(BASE_DIR, "model_metadata.joblib")

_MODEL = None
_METADATA = None


def load_artifacts():
    """Load model and metadata artifacts once into memory."""
    global _MODEL, _METADATA
    if _MODEL is None or _METADATA is None:
        if not os.path.exists(MODEL_JOBLIB_PATH) or not os.path.exists(METADATA_JOBLIB_PATH):
            raise FileNotFoundError(
                f"Model artifacts missing. Expected {MODEL_JOBLIB_PATH} and {METADATA_JOBLIB_PATH}. "
                f"Please run ml/train.py first."
            )
        _MODEL = joblib.load(MODEL_JOBLIB_PATH)
        _METADATA = joblib.load(METADATA_JOBLIB_PATH)
    return _MODEL, _METADATA


def predict(
    item_id: Union[int, str],
    session_id: Union[int, str],
    date_str: str,
    is_holiday: bool = False,
    is_exam_period: bool = False,
    weather_note: str = "",
    headcount: Union[int, float, None] = None
) -> Dict[str, Any]:
    """
    Predict recommended prep quantity (kg) and customer order volume for an item, session, and date.
    Maintains 100% backward compatibility with NutriFlow API contract.
    """
    if not date_str:
        date_str = datetime.now().strftime("%Y-%m-%d")

    # Step 1: Map cafeteria identifiers to dataset features
    meal_id = map_item_to_meal(item_id)
    center_id = map_session_to_center(session_id)
    week = date_to_week(date_str)

    try:
        model, metadata = load_artifacts()
    except Exception as e:
        # Graceful fallback if model artifacts are being trained/reloaded
        fallback_orders = int(headcount * 0.4) if (headcount and headcount > 0) else 150
        baseline_kg = round(fallback_orders * 0.35, 1)
        adjusted_kg = adjust_for_conditions(baseline_kg, is_holiday, is_exam_period, weather_note)
        return {
            "item_id": item_id,
            "session_id": session_id,
            "date": date_str,
            "baseline_kg": baseline_kg,
            "recommended_quantity_prepared_kg": adjusted_kg,
            "predicted_orders": fallback_orders,
            "note": f"Fallback prediction used: {str(e)}"
        }

    meals = metadata.get("meals", {})
    centers = metadata.get("centers", {})
    feature_cols = metadata.get("feature_cols", [])
    recent_stats = metadata.get("recent_stats", {})
    global_mean = float(metadata.get("global_mean", 261.8))

    meal_info = meals.get(meal_id, {"category": "default", "cuisine": "Standard"})
    center_info = centers.get(center_id, {"center_type": "TYPE_A", "city_code": 590, "region_code": 56, "op_area": 4.0})
    category = meal_info.get("category", "default")
    cuisine = meal_info.get("cuisine", "Standard")
    center_type = center_info.get("center_type", "TYPE_A")

    # Historical demand and price features
    has_history = (meal_id, center_id) in recent_stats
    stats = recent_stats.get((meal_id, center_id), {})
    prev_week_orders = stats.get("prev_week_orders", global_mean)
    rolling_3_orders = stats.get("rolling_3_orders", global_mean)
    checkout_price = stats.get("checkout_price", 136.83)
    base_price = stats.get("base_price", 152.29)

    # Cyclical annual week features
    week_of_year = ((week - 1) % 52) + 1
    sin_week = np.sin(2 * np.pi * week_of_year / 52)
    cos_week = np.cos(2 * np.pi * week_of_year / 52)

    discount = base_price - checkout_price
    discount_percent = (discount / base_price) if base_price > 0 else 0.0
    price_ratio = (checkout_price / base_price) if base_price > 0 else 1.0
    is_discounted = 1 if checkout_price < base_price else 0

    features = {
        "week": week,
        "center_id": center_id,
        "meal_id": meal_id,
        "checkout_price": checkout_price,
        "base_price": base_price,
        "emailer_for_promotion": 0,
        "homepage_featured": 0,
        "city_code": center_info.get("city_code", 590),
        "region_code": center_info.get("region_code", 56),
        "op_area": center_info.get("op_area", 4.0),
        "discount": discount,
        "discount_percent": discount_percent,
        "price_ratio": price_ratio,
        "is_discounted": is_discounted,
        "week_of_year": week_of_year,
        "sin_week": sin_week,
        "cos_week": cos_week,
        "prev_week_orders": prev_week_orders,
        "rolling_3_orders": rolling_3_orders,
    }

    # One-hot encoded categorical dummies aligned with training feature columns
    for col in feature_cols:
        if col.startswith("category_"):
            cat_name = col.replace("category_", "")
            features[col] = 1 if category == cat_name else 0
        elif col.startswith("cuisine_"):
            cui_name = col.replace("cuisine_", "")
            features[col] = 1 if cuisine == cui_name else 0
        elif col.startswith("center_type_"):
            ctype_name = col.replace("center_type_", "")
            features[col] = 1 if center_type == ctype_name else 0

    input_df = pd.DataFrame([[features.get(c, 0) for c in feature_cols]], columns=feature_cols)

    # 3. Model Inference: predicts customer order volume
    pred = model.predict(input_df)[0]
    predicted_orders = max(0, int(round(pred)))

    # Step 4: Preparation recommendation layer (Orders -> kg)
    # The real model predicts orders, not kilograms.
    # We convert to kg using per-meal serving weight.
    baseline_kg = orders_to_prep_kg(predicted_orders, category)

    # Step 5: Operational condition adjustments (holiday, exam, weather multipliers)
    adjusted_kg = adjust_for_conditions(
        baseline_kg=baseline_kg,
        is_holiday=is_holiday,
        is_exam_period=is_exam_period,
        weather_note=weather_note
    )

    return {
        "item_id": item_id,
        "session_id": session_id,
        "date": date_str,
        "baseline_kg": baseline_kg,
        "recommended_quantity_prepared_kg": adjusted_kg,
        "recommended_kg": adjusted_kg,
        "predicted_quantity_kg": adjusted_kg,
        "predicted_orders": predicted_orders,
        "meal_id": meal_id,
        "center_id": center_id,
        "week": week,
        "meal_category": category,
        "meal_cuisine": cuisine,
        "note": "XGBoost model inference completed successfully." if has_history else "No exact historical record found for this meal/center combination; used global baseline demand statistics.",
        "factors": [
            {
                "name": "Headcount / Order Base",
                "impact": f"{predicted_orders:,} orders",
                "positive": True
            },
            {
                "name": "Campus Holiday (-65%)" if is_holiday else "Regular Day (100%)",
                "impact": "-65%" if is_holiday else "Standard",
                "positive": not is_holiday
            },
            {
                "name": "Exam Period (-10%)" if is_exam_period else "Regular Term",
                "impact": "-10%" if is_exam_period else "Standard",
                "positive": not is_exam_period
            }
        ],
        "reasoning": (
            f"Trained XGBoost model forecasted {predicted_orders:,} customer orders "
            f"(Week {week}, Meal #{meal_id} [{category}], Center #{center_id}). "
            f"Serving-weight conversion yields {baseline_kg} kg baseline prep weight."
        )
    }


if __name__ == "__main__":
    res1 = predict(item_id=1, session_id=2, date_str="2026-09-07")
    print("Normal Monday:", res1)

    res2 = predict(item_id=1, session_id=2, date_str="2026-09-07", is_holiday=True)
    print("Holiday Monday:", res2)

    res3 = predict(item_id=4, session_id=2, date_str="2026-09-07", is_exam_period=True)
    print("Exam period Paneer:", res3)