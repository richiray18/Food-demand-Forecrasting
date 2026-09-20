import pandas as pd

def add_features(df):
    """Add day-of-week and other derived columns."""
    df = df.copy()
    df['date'] = pd.to_datetime(df['date'])
    df['day_of_week'] = df['date'].dt.dayofweek  # 0=Monday ... 6=Sunday
    return df

def compute_averages(df):
    """
    Group historical data by item + session + day_of_week,
    and compute average consumption for each combination.
    This becomes our 'baseline' prediction.
    """
    df = add_features(df)
    grouped = df.groupby(['item_id', 'session_id', 'day_of_week'])['quantity_consumed_kg']
    averages = grouped.mean().reset_index()
    averages.rename(columns={'quantity_consumed_kg': 'baseline_kg'}, inplace=True)
    return averages

def adjust_for_conditions(baseline_kg, is_holiday=False, is_exam_period=False, weather_note=""):
    """
    Adjust the baseline average based on today's specific conditions.
    These multipliers came from the patterns we built into the synthetic data,
    and roughly match real-world dining hall behavior.
    """
    adjusted = baseline_kg

    if is_holiday:
        adjusted *= 0.35   # big drop on holidays
    if is_exam_period:
        adjusted *= 0.90   # slight drop during exams

    if weather_note in ("heavy rain", "cold wave", "extreme heat"):
        adjusted *= 0.90   # bad weather slightly reduces turnout

    return round(adjusted, 1)