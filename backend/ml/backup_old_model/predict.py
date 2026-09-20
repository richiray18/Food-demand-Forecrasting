import pickle
import pandas as pd
from datetime import datetime

from model import adjust_for_conditions

import os

MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model.pkl")

with open(MODEL_PATH, "rb") as f:
    AVERAGES = pickle.load(f)
    
def predict(item_id, session_id, date_str, is_holiday=False, is_exam_period=False, weather_note=""):
    """
    Predict recommended prep quantity (kg) for a given item, session, and date.
    date_str format: 'YYYY-MM-DD'
    """
    date_obj = datetime.strptime(date_str, "%Y-%m-%d")
    day_of_week = date_obj.weekday()

    match = AVERAGES[
        (AVERAGES['item_id'] == item_id) &
        (AVERAGES['session_id'] == session_id) &
        (AVERAGES['day_of_week'] == day_of_week)
    ]

    if match.empty:
        return {
            "item_id": item_id,
            "session_id": session_id,
            "date": date_str,
            "recommended_quantity_prepared_kg": None,
            "note": "No historical data for this item/session/day-of-week combination"
        }

    baseline = float(match.iloc[0]['baseline_kg'])
    adjusted = float(adjust_for_conditions(baseline, is_holiday, is_exam_period, weather_note))

    return {
        "item_id": item_id,
        "session_id": session_id,
        "date": date_str,
        "baseline_kg": baseline,
        "recommended_quantity_prepared_kg": adjusted
    }


if __name__ == "__main__":
    
    result = predict(item_id=1, session_id=2, date_str="2026-09-07")  # a Monday
    print(result)

    result_holiday = predict(item_id=1, session_id=2, date_str="2026-09-07", is_holiday=True)
    print(result_holiday)