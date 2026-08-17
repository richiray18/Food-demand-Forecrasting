import random
from datetime import date, timedelta
from django.core.management.base import BaseCommand
from meals.models import MealSession, MenuItem, MealConsumptionLog


class Command(BaseCommand):
    help = "Seeds meals app with sessions, menu items, and mock consumption logs"

    def handle(self, *args, **options):
        self.stdout.write("Seeding meal sessions...")
        sessions_data = [
            ("BREAKFAST", "07:00", "09:30"),
            ("LUNCH", "12:00", "14:30"),
            ("SNACKS", "16:30", "18:00"),
            ("DINNER", "19:30", "21:30"),
        ]
        sessions = {}
        for name, start, end in sessions_data:
            obj, created = MealSession.objects.get_or_create(
                name=name, defaults={"start_time": start, "end_time": end}
            )
            sessions[name] = obj
            self.stdout.write(f"  {'created' if created else 'exists'}: {name}")

        self.stdout.write("Seeding menu items...")
        items_data = [
            ("Rice", "MAIN", 60, 2.7),
            ("Dal", "MAIN", 120, 0.9),
            ("Roti", "SIDE", 40, 0.8),
            ("Paneer Butter Masala", "MAIN", 220, 3.2),
            ("Curd", "SIDE", 90, 1.1),
            ("Tea", "BEVERAGE", 30, 0.3),
            ("Gulab Jamun", "DESSERT", 150, 1.5),
            ("Chicken Hyderabadi", "MAIN", 280, 5.5),
            ("Coffee", "BEVERAGE", 35, 0.3),
            ("Salad", "SIDE", 50, 0.4),
            ("Cheese Sandwich", "SIDE", 100, 1.8),
            ("Upma", "MAIN", 55, 1.0),
        ]
        items = {}
        for name, category, cost, carbon in items_data:
            obj, created = MenuItem.objects.get_or_create(
                name=name,
                defaults={
                    "category": category,
                    "cost_per_kg": cost,
                    "carbon_factor_kg_co2e_per_kg": carbon,
                },
            )
            items[name] = obj
            self.stdout.write(f"  {'created' if created else 'exists'}: {name}")

        self.stdout.write("Seeding consumption logs...")
        start_date = date(2026, 8, 10)
        num_days = 21
        holiday_dates = {5, 12, 19}       # offsets from start_date treated as holidays
        exam_dates = {8, 9, 15, 16}       # offsets treated as exam period

        created_count = 0
        for offset in range(num_days):
            log_date = start_date + timedelta(days=offset)
            is_holiday = offset in holiday_dates
            is_exam = offset in exam_dates

            # pick 2-3 random session+item combos per day
            num_entries = random.randint(2, 3)
            chosen_sessions = random.sample(list(sessions.values()), k=num_entries)

            for session in chosen_sessions:
                item = random.choice(list(items.values()))
                headcount = random.randint(200, 340)

                if is_holiday:
                    prepared = round(random.uniform(40, 65), 2)
                    consumed = round(prepared * random.uniform(0.45, 0.65), 2)  # big surplus
                elif is_exam:
                    prepared = round(random.uniform(45, 60), 2)
                    consumed = round(prepared * random.uniform(0.90, 0.98), 2)  # tight match
                else:
                    prepared = round(random.uniform(35, 60), 2)
                    consumed = round(prepared * random.uniform(0.75, 0.92), 2)  # normal day

                obj, created = MealConsumptionLog.objects.get_or_create(
                    date=log_date,
                    session=session,
                    item=item,
                    defaults={
                        "quantity_prepared_kg": prepared,
                        "quantity_consumed_kg": consumed,
                        "headcount": headcount,
                        "is_holiday": is_holiday,
                        "is_exam_period": is_exam,
                        "weather_note": "heavy rain" if offset in {1, 8} else "",
                    },
                )
                if created:
                    created_count += 1

        self.stdout.write(self.style.SUCCESS(
            f"Done. {created_count} new consumption logs created (existing rows left untouched)."
        ))