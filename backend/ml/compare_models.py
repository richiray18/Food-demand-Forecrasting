import os
import pickle
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

from train_xgboost import load_and_merge_data, build_feature_matrix

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "xgboost_model.pkl")
METADATA_PATH = os.path.join(BASE_DIR, "xgboost_metadata.pkl")


def evaluate_predictions(y_true, y_pred):
    mae = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    r2 = r2_score(y_true, y_pred)
    return mae, rmse, r2


def main():
    print("=" * 65)
    print("NutriFlow Demand Forecasting - Baseline vs XGBoost Comparison")
    print("=" * 65)

    if not os.path.exists(MODEL_PATH) or not os.path.exists(METADATA_PATH):
        print("Model or metadata not found. Please train first.")
        return

    with open(MODEL_PATH, "rb") as f:
        xgb_model = pickle.load(f)
    with open(METADATA_PATH, "rb") as f:
        metadata = pickle.load(f)

    cutoff_week = metadata.get("cutoff_week", 117)
    feature_cols = metadata["feature_cols"]

    # 1. Load data
    merged_df, _, _ = load_and_merge_data()

    # 2. Chronological split (exact same split)
    train_df = merged_df[merged_df["week"] < cutoff_week].copy()
    test_df = merged_df[merged_df["week"] >= cutoff_week].copy()

    y_test = test_df["num_orders"].values

    print(f"Test period: weeks {test_df['week'].min()} to {test_df['week'].max()} ({len(test_df)} samples)")

    # ---------------------------------------------------------
    # Baseline 1: Historical-Average Model (grouped by meal_id & center_id)
    # ---------------------------------------------------------
    global_avg = train_df["num_orders"].mean()
    hist_averages = train_df.groupby(["meal_id", "center_id"])["num_orders"].mean().reset_index()
    hist_averages.rename(columns={"num_orders": "baseline_orders"}, inplace=True)

    baseline_merged = test_df.merge(hist_averages, on=["meal_id", "center_id"], how="left")
    baseline_pred = baseline_merged["baseline_orders"].fillna(global_avg).values
    baseline_pred = np.clip(baseline_pred, 0, None)

    b_mae, b_rmse, b_r2 = evaluate_predictions(y_test, baseline_pred)

    # ---------------------------------------------------------
    # Model 2: Improved XGBoost Regressor
    # ---------------------------------------------------------
    X_test = build_feature_matrix(test_df, cat_columns_train=feature_cols, is_training=False)

    xgb_pred = xgb_model.predict(X_test)
    xgb_pred = np.clip(xgb_pred, 0, None)

    x_mae, x_rmse, x_r2 = evaluate_predictions(y_test, xgb_pred)

    # ---------------------------------------------------------
    # Comparison Output Table
    # ---------------------------------------------------------
    print("\n" + "=" * 65)
    print(f"{'Model':<25} | {'MAE':<10} | {'RMSE':<10} | {'R²':<10}")
    print("-" * 65)
    print(f"{'Historical-Average':<25} | {b_mae:<10.2f} | {b_rmse:<10.2f} | {b_r2:<10.4f}")
    print(f"{'XGBoost Regressor':<25} | {x_mae:<10.2f} | {x_rmse:<10.2f} | {x_r2:<10.4f}")
    print("=" * 65)

    mae_improvement = ((b_mae - x_mae) / b_mae) * 100
    rmse_improvement = ((b_rmse - x_rmse) / b_rmse) * 100
    print(f"\nXGBoost Improvement over Historical-Average:")
    print(f"MAE  reduction: {mae_improvement:.1f}%")
    print(f"RMSE reduction: {rmse_improvement:.1f}%")
    print(f"R²   gain     : from {b_r2:.4f} to {x_r2:.4f}")
    print("=" * 65)


if __name__ == "__main__":
    main()
