import os
import pickle
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from xgboost import XGBRegressor

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
MODEL_PATH = os.path.join(BASE_DIR, "xgboost_model.pkl")
METADATA_PATH = os.path.join(BASE_DIR, "xgboost_metadata.pkl")


def load_and_merge_data():
    """Load train, meal_info, and fulfilment_center_info datasets and merge them."""
    train_path = os.path.join(DATA_DIR, "train.csv")
    meal_path = os.path.join(DATA_DIR, "meal_info.csv")
    center_path = os.path.join(DATA_DIR, "fulfilment_center_info.csv")

    train_df = pd.read_csv(train_path)
    meal_df = pd.read_csv(meal_path)
    center_df = pd.read_csv(center_path)

    merged_df = train_df.merge(meal_df, on="meal_id", how="left")
    merged_df = merged_df.merge(center_df, on="center_id", how="left")
    return merged_df, meal_df, center_df


def engineer_features(df):
    """
    Engineer domain features:
    - discount: dollar difference between base and checkout
    - discount_percent: percentage discount (safe against division by zero)
    - price_ratio: ratio of checkout to base price (identifies markups vs markdowns)
    - is_discounted: binary flag whether checkout price is lower than base price
    - week_of_year: annual seasonal week cycle (1 to 52)
    - sin_week / cos_week: cyclical trigonometric encodings for seamless annual seasonality
    """
    data = df.copy()

    # Price differences & ratio
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

    # Cyclical annual seasonality
    data["week_of_year"] = ((data["week"] - 1) % 52) + 1
    data["sin_week"] = np.sin(2 * np.pi * data["week_of_year"] / 52)
    data["cos_week"] = np.cos(2 * np.pi * data["week_of_year"] / 52)

    return data


def build_feature_matrix(df, cat_columns_train=None, is_training=True):
    """
    Transform raw merged dataframe into numerical feature matrix.
    Uses one-hot encoding for nominal categories fit strictly on training set to avoid data leakage.
    """
    processed = engineer_features(df)
    nominal_cols = ["category", "cuisine", "center_type"]

    processed = pd.get_dummies(processed, columns=nominal_cols, drop_first=True, dtype=int)

    drop_cols = ["id", "num_orders"]

    if is_training:
        feature_cols = [c for c in processed.columns if c not in drop_cols]
        return processed[feature_cols], feature_cols
    else:
        # Align test columns with training columns
        for c in cat_columns_train:
            if c not in processed.columns:
                processed[c] = 0
        return processed[cat_columns_train]


def main():
    print("=" * 60)
    print("Starting NutriFlow Improved XGBoost Demand Forecasting")
    print("=" * 60)

    # 1. Load data
    merged_df, meal_df, center_df = load_and_merge_data()

    # 2. Chronological 80/20 split BEFORE any encoding or model fitting
    min_week = merged_df["week"].min()
    max_week = merged_df["week"].max()
    total_weeks = max_week - min_week + 1
    cutoff_week = int(min_week + 0.8 * total_weeks)  # Week 117

    print(f"Total weeks: {min_week} to {max_week} ({total_weeks} weeks)")
    print(f"Chronological 80% cutoff week: {cutoff_week}")

    train_raw = merged_df[merged_df["week"] < cutoff_week].copy()
    test_raw = merged_df[merged_df["week"] >= cutoff_week].copy()

    y_train = train_raw["num_orders"].values
    y_test = test_raw["num_orders"].values

    print(f"Training split: {len(train_raw)} rows (weeks {train_raw['week'].min()} to {train_raw['week'].max()})")
    print(f"Testing split:  {len(test_raw)} rows (weeks {test_raw['week'].min()} to {test_raw['week'].max()})")

    # 3. Featurization fit strictly on training set
    X_train, feature_cols = build_feature_matrix(train_raw, is_training=True)
    X_test = build_feature_matrix(test_raw, cat_columns_train=feature_cols, is_training=False)

    print(f"Total features: {len(feature_cols)}")

    # 4. Train XGBRegressor
    print("\nTraining XGBRegressor...")
    model = XGBRegressor(
        n_estimators=500,
        learning_rate=0.05,
        max_depth=8,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        n_jobs=-1,
        objective="reg:squarederror",
    )

    model.fit(X_train, y_train)
    print("Training complete.")

    # 5. Evaluate on chronological test period
    y_pred = model.predict(X_test)
    y_pred = np.clip(y_pred, 0, None)

    mae = mean_absolute_error(y_test, y_pred)
    mse = mean_squared_error(y_test, y_pred)
    rmse = np.sqrt(mse)
    r2 = r2_score(y_test, y_pred)

    print("\n" + "=" * 45)
    print("Improved XGBoost Model Evaluation")
    print("=" * 45)
    print(f"MAE  : {mae:.2f} orders")
    print(f"RMSE : {rmse:.2f} orders")
    print(f"R²   : {r2:.4f}")
    print("=" * 45)

    # 6. Save model and metadata
    print(f"\nSaving model to {MODEL_PATH}...")
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(model, f)

    metadata = {
        "feature_cols": feature_cols,
        "cutoff_week": cutoff_week,
        "metrics": {"mae": mae, "rmse": rmse, "r2": r2},
        "meals": meal_df.set_index("meal_id").to_dict(orient="index"),
        "centers": center_df.set_index("center_id").to_dict(orient="index"),
    }

    print(f"Saving metadata to {METADATA_PATH}...")
    with open(METADATA_PATH, "wb") as f:
        pickle.dump(metadata, f)

    print("\n[SUCCESS] Improved XGBoost training and serialization complete.")


if __name__ == "__main__":
    main()
