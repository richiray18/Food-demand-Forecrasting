# Forecasting API

Predicts recommended food preparation quantity for a given item, session, and date, based on historical consumption patterns.

## Endpoint

GET /api/forecasting/predict/

## Required Query Parameters

- item_id (integer) - the menu item ID
- session_id (integer) - 1=Breakfast, 2=Lunch, 3=Snacks, 4=Dinner
- date (string) - format YYYY-MM-DD

## Optional Query Parameters

- is_holiday (true/false) - default false
- is_exam_period (true/false) - default false
- weather_note (string) - "heavy rain", "extreme heat", "cold wave", or blank

## Example Request

GET /api/forecasting/predict/?item_id=1&session_id=2&date=2026-09-07&is_holiday=true

## Example Response

{
    "item_id": 1,
    "session_id": 2,
    "date": "2026-09-07",
    "baseline_kg": 41.7,
    "recommended_quantity_prepared_kg": 14.6
}

## Notes

If there's no historical data for the given item/session/day-of-week combination, recommended_quantity_prepared_kg will be null and a note will explain why.