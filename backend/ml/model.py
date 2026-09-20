"""
model.py - Shared ML Pipeline, Feature Engineering & Multiplier Logic

Contains:
1. Shared dataset loading and feature engineering for the real food demand dataset.
2. Lag and rolling historical features computed strictly from past weeks (no target leakage).
3. Preparation recommendation layer converting predicted orders to kg using per-meal serving weights.
4. Legacy operational condition adjustments (holiday, exam, weather multipliers).
5. Historical-average benchmark helper (compute_averages).
"""

import os
import numpy as np
import pandas as pd
from typing import Tuple, List, Optional

try:
    from .id_mapping import get_serving_weight
except (ImportError, ValueError):
    from id_mapping import get_serving_weight


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DATA_DIR = os.path.join(BASE_DIR, "data")


def load_and_merge_datasets(data_dir: Optional[str] = None) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Load train.csv, meal_info.csv, and fulfilment_center_info.csv and merge on meal_id & center_id.
    """
    if data_dir is None:
        data_dir = DEFAULT_DATA_DIR

    train_path = os.path.join(data_dir, "train.csv")
    meal_path = os.path.join(data_dir, "meal_info.csv")
    center_path = os.path.join(data_dir, "fulfilment_center_info.csv")

    train_df = pd.read_csv(train_path)
    meal_df = pd.read_csv(meal_path)
    center_df = pd.read_csv(center_path)

    merged = train_df.merge(meal_df, on="meal_id", how="left")
    merged = merged.merge(center_df, on="center_id", how="left")
    return merged, meal_df, center_df


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Build real regression features:
    - Time features: week, annual cyclical sine and cosine encodings
    - Pricing features: checkout_price, base_price, discount, discount_percent, price_ratio, is_discounted
    - Promotion features: emailer_for_promotion, homepage_featured
    - History features: previous-week demand (lag 1) and rolling 3-week demand, strictly from past weeks.

    NOTE: No prepared quantity is ever used as an input feature (avoids target leakage).
    """
    data = df.copy()

    # Price difference and ratio features
    data["discount"] = data["base_price"] - data["checkout_price"]
    data["discount_percent"] = np.where(
        data["base_price"] > 0,
        (data["base_price"] - data["checkout_price"]) / data["base_price"],
        0.0,
    )
    data["price_ratio"] = np.where(
        data["base_price"] > 0,
        data["checkout_price"] / data["base_price"],
        1.0,
    )
    data["is_discounted"] = (data["checkout_price"] < data["base_price"]).astype(int)

    # Cyclical annual seasonality (52 weeks/year)
    week_of_year = ((data["week"] - 1) % 52) + 1
    data["week_of_year"] = week_of_year
    data["sin_week"] = np.sin(2 * np.pi * week_of_year / 52)
    data["cos_week"] = np.cos(2 * np.pi * week_of_year / 52)

    # Historical lag and rolling demand strictly from previous weeks
    if "num_orders" in data.columns and len(data) > 1:
        orig_index = data.index
        data = data.sort_values(["center_id", "meal_id", "week"])
        # Shift by 1 so current week target is never used
        data["prev_week_orders"] = data.groupby(["center_id", "meal_id"])["num_orders"].shift(1)
        data["rolling_3_orders"] = data.groupby(["center_id", "meal_id"])["num_orders"].transform(
            lambda s: s.shift(1).rolling(3, min_periods=1).mean()
        )
        # Fill first occurrences with global/meal average
        global_avg = float(data["num_orders"].mean())
        data["prev_week_orders"] = data["prev_week_orders"].fillna(global_avg)
        data["rolling_3_orders"] = data["rolling_3_orders"].fillna(global_avg)
        data = data.loc[orig_index]
    else:
        # Defaults for single-row inference if not provided
        if "prev_week_orders" not in data.columns:
            data["prev_week_orders"] = 200.0
        if "rolling_3_orders" not in data.columns:
            data["rolling_3_orders"] = 200.0

    return data


def build_feature_matrix(
    df: pd.DataFrame,
    cat_columns_train: Optional[List[str]] = None,
    is_training: bool = True
) -> Tuple[pd.DataFrame, List[str]]:
    """
    Transform merged dataframe into numeric feature matrix with one-hot encoded nominal columns.
    One-hot dummy columns are fit strictly on training data to prevent leakage.
    """
    processed = engineer_features(df)
    nominal_cols = ["category", "cuisine", "center_type"]

    processed = pd.get_dummies(processed, columns=nominal_cols, drop_first=True, dtype=int)

    drop_cols = ["id", "num_orders"]

    if is_training:
        feature_cols = [c for c in processed.columns if c not in drop_cols]
        return processed[feature_cols], feature_cols
    else:
        # Align inference/test columns to exact training schema
        for c in cat_columns_train:
            if c not in processed.columns:
                processed[c] = 0
        return processed[cat_columns_train], cat_columns_train


# --------------------------------------------------------------------------
# Step 4 — Preparation Recommendation Layer (Orders -> kg)
# --------------------------------------------------------------------------
def orders_to_prep_kg(predicted_orders: float, category: str = "default") -> float:
    """
    Convert predicted customer demand orders to recommended cooking mass (kg).
    Formula: recommended_kg = predicted_orders * serving_weight_per_order.
    This conversion is applied strictly AFTER model inference.
    """
    serving_weight = get_serving_weight(category)
    return round(float(predicted_orders) * serving_weight, 1)


# --------------------------------------------------------------------------
# Operational Multipliers (Preserved Contract)
# --------------------------------------------------------------------------
def adjust_for_conditions(
    baseline_kg: float,
    is_holiday: bool = False,
    is_exam_period: bool = False,
    weather_note: str = ""
) -> float:
    """
    Adjust the baseline prep mass (kg) based on today's specific cafeteria conditions.
    Applies the exact three multipliers from NutriFlow's operational rules:
    - holiday: x0.35 (campus attendance drops significantly)
    - exam period: x0.90 (slight drop / irregular meal patterns)
    - adverse weather: x0.90 (heavy rain, cold wave, extreme heat reduce turnout)
    """
    adjusted = float(baseline_kg)

    if is_holiday:
        adjusted *= 0.35
    if is_exam_period:
        adjusted *= 0.90

    weather_lower = str(weather_note or "").strip().lower()
    if weather_lower in ("heavy rain", "cold wave", "extreme heat", "rain", "heat"):
        adjusted *= 0.90

    return round(adjusted, 1)


# --------------------------------------------------------------------------
# Historical Average Model Helper (Benchmark)
# --------------------------------------------------------------------------
def add_features(df: pd.DataFrame) -> pd.DataFrame:
    """Legacy helper: add day-of-week for synthetic cafeteria logs."""
    data = df.copy()
    data["date"] = pd.to_datetime(data["date"])
    data["day_of_week"] = data["date"].dt.dayofweek
    return data


def compute_averages(df: pd.DataFrame) -> pd.DataFrame:
    """
    Legacy baseline benchmark: compute mean consumption grouped by item, session, and day.
    """
    data = add_features(df)
    grouped = data.groupby(["item_id", "session_id", "day_of_week"])["quantity_consumed_kg"]
    averages = grouped.mean().reset_index()
    averages.rename(columns={"quantity_consumed_kg": "baseline_kg"}, inplace=True)
    return averages