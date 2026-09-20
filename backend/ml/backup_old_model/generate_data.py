import os, sys, random
from datetime import date, timedelta

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from meals.models import MealConsumptionLog

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

created = 0
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

            MealConsumptionLog.objects.update_or_create(
                date=current,
                session_id=session_id,
                item_id=item_id,
                defaults=dict(
                    quantity_prepared_kg=prepared,
                    quantity_consumed_kg=consumed,
                    headcount=headcount,
                    is_holiday=is_holiday,
                    is_exam_period=is_exam,
                    weather_note=weather,
                ),
            )
            created += 1

print(f"Created/updated {created} MealConsumptionLog rows")