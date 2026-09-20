import os
import pickle
import numpy as np
import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "xgboost_model.pkl")
METADATA_PATH = os.path.join(BASE_DIR, "xgboost_metadata.pkl")

_MODEL = None
_METADATA = None


def _load_artifacts():
    global _MODEL, _METADATA
    if _MODEL is None or _METADATA is None:
        if not os.path.exists(MODEL_PATH) or not os.path.exists(METADATA_PATH):
            raise FileNotFoundError(
                f"Model or metadata artifact missing. Please run train_xgboost.py first. "
                f"Looked for {MODEL_PATH} and {METADATA_PATH}."
            )
        with open(MODEL_PATH, "rb") as f:
            _MODEL = pickle.load(f)
        with open(METADATA_PATH, "rb") as f:
            _METADATA = pickle.load(f)
    return _MODEL, _METADATA


def predict_orders(
    meal_id,
    center_id,
    week,
    checkout_price,
    base_price,
    emailer_for_promotion=0,
    homepage_featured=0,
):
    """
    Predict food demand (num_orders) using the improved XGBoost model.

    Parameters:
    - meal_id: int
    - center_id: int
    - week: int (e.g. week 146)
    - checkout_price: float
    - base_price: float
    - emailer_for_promotion: int (0 or 1)
    - homepage_featured: int (0 or 1)

    Returns:
    dict with meal_id, center_id, week, predicted_orders
    """
    model, metadata = _load_artifacts()

    meal_id = int(meal_id)
    center_id = int(center_id)
    week = int(week)
    checkout_price = float(checkout_price)
    base_price = float(base_price)
    emailer_for_promotion = int(emailer_for_promotion)
    homepage_featured = int(homepage_featured)

    meals = metadata["meals"]
    centers = metadata["centers"]
    feature_cols = metadata["feature_cols"]

    if meal_id not in meals:
        raise ValueError(f"meal_id {meal_id} not found in meal catalog.")

    if center_id not in centers:
        raise ValueError(f"center_id {center_id} not found in fulfillment center catalog.")

    meal_info = meals[meal_id]
    center_info = centers[center_id]

    category = meal_info.get("category", "")
    cuisine = meal_info.get("cuisine", "")
    center_type = center_info.get("center_type", "")
    city_code = center_info.get("city_code", 0)
    region_code = center_info.get("region_code", 0)
    op_area = center_info.get("op_area", 0.0)

    # Engineered price features
    discount = base_price - checkout_price
    discount_percent = (discount / base_price) if base_price > 0 else 0.0
    price_ratio = (checkout_price / base_price) if base_price > 0 else 1.0
    is_discounted = 1 if checkout_price < base_price else 0

    # Cyclical annual seasonality
    week_of_year = ((week - 1) % 52) + 1
    sin_week = np.sin(2 * np.pi * week_of_year / 52)
    cos_week = np.cos(2 * np.pi * week_of_year / 52)

    features = {
        "week": week,
        "center_id": center_id,
        "meal_id": meal_id,
        "checkout_price": checkout_price,
        "base_price": base_price,
        "emailer_for_promotion": emailer_for_promotion,
        "homepage_featured": homepage_featured,
        "city_code": city_code,
        "region_code": region_code,
        "op_area": op_area,
        "discount": discount,
        "discount_percent": discount_percent,
        "price_ratio": price_ratio,
        "is_discounted": is_discounted,
        "week_of_year": week_of_year,
        "sin_week": sin_week,
        "cos_week": cos_week,
    }

    # Set one-hot indicator columns for categorical fields
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

    input_df = pd.DataFrame([[features.get(col, 0) for col in feature_cols]], columns=feature_cols)

    pred = model.predict(input_df)[0]
    predicted_orders = max(0, int(round(pred)))

    return {
        "meal_id": meal_id,
        "center_id": center_id,
        "week": week,
        "predicted_orders": predicted_orders,
    }


if __name__ == "__main__":
    try:
        sample = predict_orders(
            meal_id=1885,
            center_id=13,
            week=146,
            checkout_price=136.83,
            base_price=152.29,
            emailer_for_promotion=0,
            homepage_featured=0,
        )
        print("Sample prediction:", sample)
    except Exception as e:
        print("Prediction test:", e)
