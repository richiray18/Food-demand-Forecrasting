"""
evaluate_model.py

Computes a genuine, defensible accuracy number for the forecasting model,
using a proper held-out test split (not testing on the same data it
trained on, which would be misleading).

Regenerates the same synthetic dataset generate_data.py produces (same
seed, same logic — kept in sync deliberately), splits it by date into
train/test, trains baseline averages on train only, and evaluates
predictions against the untouched test period.
"""
import random
from datetime import date, timedelta
import pandas as pd

from model import compute_averages, adjust_for_conditions

random.seed(42)

SESSION_ITEMS = {
    1: [12, 6, 9, 11],
    2: [1, 2, 3, 13, 8, 10, 5],
    3: [6, 9, 7],
    4: [1, 2, 3, 13, 8],
}
BASE_HEADCOUNT = {1: 250, 2: 500, 3: 150, 4: 400}
START_DATE = date(2026, 5, 1)
NUM_DAYS = 100
EXAM_START = date(2026, 7, 1)
EXAM_END = date(2026, 7, 15)
HOLIDAYS = {date(2026, 6, 15), date(2026, 7, 20), date(2026, 8, 15)}
WEATHER_OPTIONS = ["", "", "", "", "heavy rain", "extreme heat", "cold wave"]

rows = []
for i in range(NUM_DAYS):
    current = START_DATE + timedelta(days=i)
    is_holiday = current in HOLIDAYS
    is_exam = EXAM_START <= current <= EXAM_END
    weekday = current.weekday()

    for session_id, item_ids in SESSION_ITEMS.items():
        base_hc = BASE_HEADCOUNT[session_id]
        if weekday >= 5:
            base_hc = int(base_hc * 0.6)
        if is_holiday:
            base_hc = int(base_hc * 0.3)
        if is_exam:
            base_hc = int(base_hc * (1.2 if session_id in (3, 4) else 0.85))

        headcount = max(10, base_hc + random.randint(-20, 20))
        weather = random.choice(WEATHER_OPTIONS)
        weather_penalty = 0.9 if weather else 1.0

        for item_id in item_ids:
            prepared = round(headcount * random.uniform(0.08, 0.14), 1)
            consumed = round(prepared * random.uniform(0.75, 0.95) * weather_penalty, 1)
            rows.append({
                "date": current, "session_id": session_id, "item_id": item_id,
                "quantity_prepared_kg": prepared, "quantity_consumed_kg": consumed,
                "headcount": headcount, "is_holiday": is_holiday,
                "is_exam_period": is_exam, "weather_note": weather,
            })

df = pd.DataFrame(rows)
df["date"] = pd.to_datetime(df["date"])

# --- Time-based split: train on first 80 days, test on the last 20 the
# --- model has never seen. This is the part the original code never did.
split_date = df["date"].sort_values().unique()[80]
train_df = df[df["date"] < split_date].copy()
test_df = df[df["date"] >= split_date].copy()

print(f"Train: {len(train_df)} rows ({train_df['date'].min().date()} to {train_df['date'].max().date()})")
print(f"Test:  {len(test_df)} rows ({test_df['date'].min().date()} to {test_df['date'].max().date()})")

# Train baseline ONLY on train_df — test period is genuinely unseen
averages = compute_averages(train_df.rename(columns={}))
averages = averages.rename(columns={"baseline_kg": "baseline_kg"})

# Predict for every test row using train-only averages
test_df["day_of_week"] = test_df["date"].dt.dayofweek
merged = test_df.merge(averages, on=["item_id", "session_id", "day_of_week"], how="left")

no_history = merged["baseline_kg"].isna().sum()
merged = merged.dropna(subset=["baseline_kg"])

merged["predicted_kg"] = merged.apply(
    lambda r: adjust_for_conditions(r["baseline_kg"], r["is_holiday"], r["is_exam_period"], r["weather_note"]),
    axis=1,
)

merged["abs_error"] = (merged["predicted_kg"] - merged["quantity_consumed_kg"]).abs()
merged["ape"] = merged["abs_error"] / merged["quantity_consumed_kg"].replace(0, pd.NA)

mae = merged["abs_error"].mean()
mape = merged["ape"].mean() * 100
accuracy = max(0, 100 - mape)

print(f"\nTest rows with no historical match (excluded): {no_history}")
print(f"Test rows evaluated: {len(merged)}")
print(f"Mean Absolute Error: {mae:.2f} kg")
print(f"Mean Absolute Percentage Error: {mape:.1f}%")
print(f"==> Backtested accuracy (100 - MAPE): {accuracy:.1f}%")
