"""
train.py - Train Demand Forecasting Models on Real Food Demand Dataset

Performs:
1. Merging train.csv, meal_info.csv, and fulfilment_center_info.csv.
2. Chronological train/validation split by week (weeks 1-116 train, weeks 117-145 holdout).
3. Evaluates three models:
   - Benchmark 1: Historical-Average baseline
   - Benchmark 2: Random Forest regressor
   - Primary: XGBoost regressor
4. Computes genuine evaluation metrics: MAE, RMSE, R², and RMSLE (no fabricated "accuracy").
5. Serializes the primary XGBoost model and preprocessing metadata with joblib.
"""

import os
import sys
import numpy as np
import pandas as pd
import joblib
import pickle
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from xgboost import XGBRegressor

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from model import load_and_merge_datasets, build_feature_matrix

MODEL_JOBLIB_PATH = os.path.join(BASE_DIR, "model.joblib")
METADATA_JOBLIB_PATH = os.path.join(BASE_DIR, "model_metadata.joblib")
LEGACY_MODEL_PKL_PATH = os.path.join(BASE_DIR, "model.pkl")


def calculate_metrics(y_true, y_pred):
    """Compute MAE, RMSE, R2, and RMSLE."""
    y_clipped = np.clip(y_pred, 0, None)
    mae = mean_absolute_error(y_true, y_clipped)
    mse = mean_squared_error(y_true, y_clipped)
    rmse = np.sqrt(mse)
    r2 = r2_score(y_true, y_clipped)
    rmsle = np.sqrt(mean_squared_error(np.log1p(y_true), np.log1p(y_clipped)))
    return {"mae": mae, "rmse": rmse, "r2": r2, "rmsle": rmsle}


def main():
    print("=" * 70)
    print("NutriFlow ML Training: Real Dataset & Three-Model Benchmark")
    print("=" * 70)

    # 1. Load and merge datasets
    merged_df, meal_df, center_df = load_and_merge_datasets()
    print(f"Loaded {len(merged_df):,} total transaction records.")

    # Sort strictly chronologically by center, meal, week to compute historical lag features
    merged_df = merged_df.sort_values(["center_id", "meal_id", "week"]).reset_index(drop=True)
    # Shift by 1 so current week target is never used (prevents target leakage)
    merged_df["prev_week_orders"] = merged_df.groupby(["center_id", "meal_id"])["num_orders"].shift(1)
    merged_df["rolling_3_orders"] = merged_df.groupby(["center_id", "meal_id"])["num_orders"].transform(
        lambda s: s.shift(1).rolling(3, min_periods=1).mean()
    )
    global_mean = float(merged_df["num_orders"].mean())
    merged_df["prev_week_orders"] = merged_df["prev_week_orders"].fillna(global_mean)
    merged_df["rolling_3_orders"] = merged_df["rolling_3_orders"].fillna(global_mean)

    # 2. Chronological 80/20 train/validation split by week
    min_week = int(merged_df["week"].min())
    max_week = int(merged_df["week"].max())
    total_weeks = max_week - min_week + 1
    cutoff_week = int(min_week + 0.8 * total_weeks)  # Week 117

    print(f"Time span: Weeks {min_week} to {max_week} ({total_weeks} weeks)")
    print(f"Chronological split cutoff: Week {cutoff_week}")

    train_raw = merged_df[merged_df["week"] < cutoff_week].copy().reset_index(drop=True)
    test_raw = merged_df[merged_df["week"] >= cutoff_week].copy().reset_index(drop=True)

    y_train = train_raw["num_orders"].values
    y_test = test_raw["num_orders"].values

    print(f"Training split:   {len(train_raw):,} records (Weeks {train_raw['week'].min()} to {train_raw['week'].max()})")
    print(f"Validation split: {len(test_raw):,} records (Weeks {test_raw['week'].min()} to {test_raw['week'].max()})")

    # 3. Build numerical feature matrices (fit dummy columns on train only)
    X_train, feature_cols = build_feature_matrix(train_raw, is_training=True)
    X_test, _ = build_feature_matrix(test_raw, cat_columns_train=feature_cols, is_training=False)
    print(f"Engineered features ({len(feature_cols)}): {feature_cols[:8]} ...")

    # =========================================================================
    # Model 1: Historical-Average Benchmark
    # =========================================================================
    print("\nEvaluating Model 1: Historical-Average Baseline...")
    hist_means = train_raw.groupby(["meal_id", "center_id"])["num_orders"].mean().reset_index()
    hist_means.rename(columns={"num_orders": "baseline_orders"}, inplace=True)

    test_merged = test_raw.merge(hist_means, on=["meal_id", "center_id"], how="left")
    baseline_pred = test_merged["baseline_orders"].fillna(global_mean).values
    baseline_metrics = calculate_metrics(y_test, baseline_pred)

    # =========================================================================
    # Model 2: Random Forest Regressor
    # =========================================================================
    print("Training Model 2: Random Forest Regressor (100 estimators, max_depth=12)...")
    rf_model = RandomForestRegressor(
        n_estimators=100,
        max_depth=12,
        random_state=42,
        n_jobs=-1,
    )
    rf_model.fit(X_train, y_train)
    rf_pred = rf_model.predict(X_test)
    rf_metrics = calculate_metrics(y_test, rf_pred)

    # =========================================================================
    # Model 3: XGBoost Regressor (Primary Model)
    # =========================================================================
    print("Training Model 3: XGBoost Regressor (300 estimators, max_depth=8, lr=0.05)...")
    xgb_model = XGBRegressor(
        n_estimators=300,
        learning_rate=0.05,
        max_depth=8,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        n_jobs=-1,
        objective="reg:squarederror",
    )
    xgb_model.fit(X_train, y_train)
    xgb_pred = xgb_model.predict(X_test)
    xgb_metrics = calculate_metrics(y_test, xgb_pred)

    # 4. Print Comparative Evaluation Table
    print("\n" + "=" * 70)
    print("Model Evaluation Comparison on Chronological Holdout (Weeks 117-145)")
    print("=" * 70)
    print(f"{'Model':<25} | {'MAE':<9} | {'RMSE':<9} | {'R²':<9} | {'RMSLE':<9}")
    print("-" * 70)
    print(f"{'Historical Average':<25} | {baseline_metrics['mae']:<9.2f} | {baseline_metrics['rmse']:<9.2f} | {baseline_metrics['r2']:<9.4f} | {baseline_metrics['rmsle']:<9.4f}")
    print(f"{'Random Forest':<25} | {rf_metrics['mae']:<9.2f} | {rf_metrics['rmse']:<9.2f} | {rf_metrics['r2']:<9.4f} | {rf_metrics['rmsle']:<9.4f}")
    print(f"{'XGBoost Regressor':<25} | {xgb_metrics['mae']:<9.2f} | {xgb_metrics['rmse']:<9.2f} | {xgb_metrics['r2']:<9.4f} | {xgb_metrics['rmsle']:<9.4f}")
    print("=" * 70)

    mae_diff = ((baseline_metrics['mae'] - xgb_metrics['mae']) / baseline_metrics['mae']) * 100
    rmse_diff = ((baseline_metrics['rmse'] - xgb_metrics['rmse']) / baseline_metrics['rmse']) * 100
    print(f"XGBoost Improvement over Historical Baseline: -{mae_diff:.1f}% MAE, -{rmse_diff:.1f}% RMSE, R² from {baseline_metrics['r2']:.4f} to {xgb_metrics['r2']:.4f}\n")

    # 5. Extract latest meal/center historical demand lookup table for live inference
    latest_orders = merged_df.sort_values(["center_id", "meal_id", "week"])
    recent_stats = {}
    for (m_id, c_id), group in latest_orders.groupby(["meal_id", "center_id"]):
        recent_3 = group["num_orders"].tail(3).tolist()
        recent_stats[(int(m_id), int(c_id))] = {
            "prev_week_orders": float(recent_3[-1]) if recent_3 else global_mean,
            "rolling_3_orders": float(np.mean(recent_3)) if recent_3 else global_mean,
            "checkout_price": float(group["checkout_price"].iloc[-1]),
            "base_price": float(group["base_price"].iloc[-1]),
        }

    # 6. Save chosen model with joblib
    print(f"Saving chosen XGBoost model to {MODEL_JOBLIB_PATH} with joblib...")
    joblib.dump(xgb_model, MODEL_JOBLIB_PATH)

    metadata = {
        "feature_cols": feature_cols,
        "cutoff_week": cutoff_week,
        "global_mean": global_mean,
        "metrics": {
            "baseline": baseline_metrics,
            "random_forest": rf_metrics,
            "xgboost": xgb_metrics,
        },
        "meals": meal_df.set_index("meal_id").to_dict(orient="index"),
        "centers": center_df.set_index("center_id").to_dict(orient="index"),
        "recent_stats": recent_stats,
    }

    print(f"Saving preprocessing metadata to {METADATA_JOBLIB_PATH} with joblib...")
    joblib.dump(metadata, METADATA_JOBLIB_PATH)

    # 7. Preserve legacy model.pkl format for backward compatibility
    try:
        legacy_averages = train_raw.groupby(["meal_id", "center_id"])["num_orders"].mean().reset_index()
        legacy_averages.rename(columns={"num_orders": "baseline_kg"}, inplace=True)
        legacy_averages["session_id"] = 2
        legacy_averages["item_id"] = 1
        legacy_averages["day_of_week"] = 0
        with open(LEGACY_MODEL_PKL_PATH, "wb") as f:
            pickle.dump(legacy_averages, f)
    except Exception as e:
        print(f"Note: legacy model.pkl export: {e}")

    print("[SUCCESS] All three models evaluated. XGBoost saved successfully.")


if __name__ == "__main__":
    main()