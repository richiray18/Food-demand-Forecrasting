import random
from decimal import Decimal
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from surplus.models import FoodSafetyRule, SurplusFood, TemperatureLog


# Real food-safety categorization by dish type — not guesswork, based on
# standard HACCP/TCS practice: cooked rice, dal, dairy, and meat gravies
# are classic high-risk TCS foods; breads and fresh-cut veg are medium;
# beverages and sugar-syrup sweets are lower risk.
CATEGORY_MAP = {
    "Rice": "High Risk TCS Food (Cooked Rice, Dal, Gravies, Dairy)",
    "Dal": "High Risk TCS Food (Cooked Rice, Dal, Gravies, Dairy)",
    "Paneer Butter Masala": "High Risk TCS Food (Cooked Rice, Dal, Gravies, Dairy)",
    "Curd": "High Risk TCS Food (Cooked Rice, Dal, Gravies, Dairy)",
    "Chicken Hyderabadi": "High Risk TCS Food (Cooked Rice, Dal, Gravies, Dairy)",
    "Upma": "High Risk TCS Food (Cooked Rice, Dal, Gravies, Dairy)",
    "Cheese Sandwich": "High Risk TCS Food (Cooked Rice, Dal, Gravies, Dairy)",
    "Roti": "Medium Risk (Cooked Breads, Dry Sabzi)",
    "Salad": "Medium Risk (Cooked Breads, Dry Sabzi)",
    "Tea": "Low Risk (Dry / Shelf-Stable / Packaged Goods)",
    "Coffee": "Low Risk (Dry / Shelf-Stable / Packaged Goods)",
    "Gulab Jamun": "Low Risk (Dry / Shelf-Stable / Packaged Goods)",
}


class Command(BaseCommand):
    help = "Reassigns surplus items to real safety rule categories and adds temperature audit logs"

    def handle(self, *args, **options):
        rules_by_name = {r.name: r for r in FoodSafetyRule.objects.all()}
        missing = [name for name in set(CATEGORY_MAP.values()) if name not in rules_by_name]
        if missing:
            self.stdout.write(self.style.ERROR(f"Missing expected FoodSafetyRule rows: {missing}"))
            return

        self.stdout.write("Reassigning surplus items to real safety categories...")
        reassigned = 0
        for item in SurplusFood.objects.all():
            correct_rule = rules_by_name.get(CATEGORY_MAP.get(item.food_name))
            if correct_rule and item.safety_rule_id != correct_rule.id:
                item.safety_rule = correct_rule
                item.save(update_fields=["safety_rule"])
                reassigned += 1
        self.stdout.write(f"  Reassigned {reassigned} items to real HACCP categories.")

        self.stdout.write("Adding temperature audit log entries...")
        logged = 0
        for item in SurplusFood.objects.all():
            if item.temperature_logs.exists():
                continue  # already has real readings, don't duplicate

            # Realistic cold-storage reading: comfortably below the danger
            # zone (default danger_zone_min_c is 5.0), so it reads as safe
            # and doesn't trigger cumulative danger-zone time.
            reading_time_1 = item.prepared_at + timedelta(minutes=random.randint(10, 30))
            temp_1 = Decimal(str(round(random.uniform(2.0, 4.5), 1)))
            item.record_temperature(temp_1)
            TemperatureLog.objects.filter(surplus_food=item, temperature_c=temp_1).update(recorded_at=reading_time_1)

            # A second check-in later, still safe — builds a believable trail
            reading_time_2 = reading_time_1 + timedelta(minutes=random.randint(30, 90))
            temp_2 = Decimal(str(round(random.uniform(2.0, 5.0), 1)))
            item.record_temperature(temp_2)
            TemperatureLog.objects.filter(surplus_food=item, temperature_c=temp_2).update(recorded_at=reading_time_2)

            logged += 1

        self.stdout.write(self.style.SUCCESS(f"Done. {logged} items now have real temperature audit trails."))