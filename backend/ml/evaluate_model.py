"""
evaluate_model.py - Model Evaluation on Chronological Holdout Split

Replaces the earlier synthetic data backtesting script with rigorous evaluation
on the real food demand dataset.

Methodology:
1. Merges train.csv, meal_info.csv, and fulfilment_center_info.csv.
2. Applies strict chronological holdout split at Week 117 (Weeks 117 to 145 = 95,200 samples).
3. Evaluates all three models against ground-truth num_orders:
   - Historical-Average Baseline
   - Random Forest Regressor
   - XGBoost Regressor (Primary)
4. Reports real regression metrics:
   - MAE  (Mean Absolute Error in orders)
   - RMSE (Root Mean Squared Error in orders)
   - R²   (Coefficient of Determination)
   - RMSLE (Root Mean Squared Logarithmic Error)

STRICT RULE:
No fabricated "accuracy" percentage is calculated or reported via 100 - MAPE.
Regression metrics MAE, RMSE, R², and RMSLE reflect true predictive capability.
"""

import os
import sys
import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from xgboost import XGBRegressor

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from model import load_and_merge_datasets, build_feature_matrix

MODEL_JOBLIB_PATH = os.path.join(BASE_DIR, "model.joblib")
METADATA_JOBLIB_PATH = os.path.join(BASE_DIR, "model_metadata.joblib")


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
    print("=" * 72)
    print("NutriFlow Demand Forecasting — Chronological Model Evaluation")
    print("=" * 72)

    # 1. Load data
    merged_df, meal_df, center_df = load_and_merge_datasets()

    # Pre-split chronological lag features
    merged_df = merged_df.sort_values(["center_id", "meal_id", "week"]).reset_index(drop=True)
    merged_df["prev_week_orders"] = merged_df.groupby(["center_id", "meal_id"])["num_orders"].shift(1)
    merged_df["rolling_3_orders"] = merged_df.groupby(["center_id", "meal_id"])["num_orders"].transform(
        lambda s: s.shift(1).rolling(3, min_periods=1).mean()
    )
    global_mean = float(merged_df["num_orders"].mean())
    merged_df["prev_week_orders"] = merged_df["prev_week_orders"].fillna(global_mean)
    merged_df["rolling_3_orders"] = merged_df["rolling_3_orders"].fillna(global_mean)

    # 2. Chronological 80/20 split
    cutoff_week = 117
    train_raw = merged_df[merged_df["week"] < cutoff_week].copy().reset_index(drop=True)
    test_raw = merged_df[merged_df["week"] >= cutoff_week].copy().reset_index(drop=True)

    y_train = train_raw["num_orders"].values
    y_test = test_raw["num_orders"].values

    print(f"Validation Holdout Period: Weeks {test_raw['week'].min()} to {test_raw['week'].max()} ({len(test_raw):,} samples)")

    # 3. Features
    X_train, feature_cols = build_feature_matrix(train_raw, is_training=True)
    X_test, _ = build_feature_matrix(test_raw, cat_columns_train=feature_cols, is_training=False)

    # =========================================================================
    # Model 1: Historical-Average Baseline
    # =========================================================================
    hist_means = train_raw.groupby(["meal_id", "center_id"])["num_orders"].mean().reset_index()
    hist_means.rename(columns={"num_orders": "baseline_orders"}, inplace=True)
    test_merged = test_raw.merge(hist_means, on=["meal_id", "center_id"], how="left")
    baseline_pred = test_merged["baseline_orders"].fillna(global_mean).values
    baseline_metrics = calculate_metrics(y_test, baseline_pred)

    # =========================================================================
    # Model 2: Random Forest Regressor
    # =========================================================================
    rf_model = RandomForestRegressor(n_estimators=100, max_depth=12, random_state=42, n_jobs=-1)
    rf_model.fit(X_train, y_train)
    rf_pred = rf_model.predict(X_test)
    rf_metrics = calculate_metrics(y_test, rf_pred)

    # =========================================================================
    # Model 3: XGBoost Regressor (Load saved artifact if available, else fit)
    # =========================================================================
    if os.path.exists(MODEL_JOBLIB_PATH):
        xgb_model = joblib.load(MODEL_JOBLIB_PATH)
    else:
        xgb_model = XGBRegressor(
            n_estimators=300, learning_rate=0.05, max_depth=8, subsample=0.8,
            colsample_bytree=0.8, random_state=42, n_jobs=-1, objective="reg:squarederror"
        )
        xgb_model.fit(X_train, y_train)

    xgb_pred = xgb_model.predict(X_test)
    xgb_metrics = calculate_metrics(y_test, xgb_pred)

    # 4. Comparative Results Table
    print("\n" + "=" * 72)
    print(f"{'Model':<25} | {'MAE (orders)':<12} | {'RMSE':<10} | {'R²':<8} | {'RMSLE':<8}")
    print("-" * 72)
    print(f"{'Historical Average':<25} | {baseline_metrics['mae']:<12.2f} | {baseline_metrics['rmse']:<10.2f} | {baseline_metrics['r2']:<8.4f} | {baseline_metrics['rmsle']:<8.4f}")
    print(f"{'Random Forest':<25} | {rf_metrics['mae']:<12.2f} | {rf_metrics['rmse']:<10.2f} | {rf_metrics['r2']:<8.4f} | {rf_metrics['rmsle']:<8.4f}")
    print(f"{'XGBoost Regressor':<25} | {xgb_metrics['mae']:<12.2f} | {xgb_metrics['rmse']:<10.2f} | {xgb_metrics['r2']:<8.4f} | {xgb_metrics['rmsle']:<8.4f}")
    print("=" * 72)

    mae_reduction = ((baseline_metrics['mae'] - xgb_metrics['mae']) / baseline_metrics['mae']) * 100
    rmse_reduction = ((baseline_metrics['rmse'] - xgb_metrics['rmse']) / baseline_metrics['rmse']) * 100
    print(f"\nXGBoost Performance Gains over Historical Baseline:")
    print(f"  • MAE Reduction : -{mae_reduction:.1f}% error")
    print(f"  • RMSE Reduction: -{rmse_reduction:.1f}% error")
    print(f"  • R² Score      : {xgb_metrics['r2']:.4f} (up from {baseline_metrics['r2']:.4f})")
    print(f"  • RMSLE Score   : {xgb_metrics['rmsle']:.4f} (down from {baseline_metrics['rmsle']:.4f})\n")

    return {
        "baseline": baseline_metrics,
        "random_forest": rf_metrics,
        "xgboost": xgb_metrics,
    }


if __name__ == "__main__":
    main()
