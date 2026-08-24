import random
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import User
from meals.models import MealConsumptionLog
from surplus.models import FoodSafetyRule, SurplusFood


class Command(BaseCommand):
    help = "Seeds a few UNCLAIMED surplus items for live demo interaction"

    def handle(self, *args, **options):
        demo_rule, _ = FoodSafetyRule.objects.get_or_create(
            name="Demo Seed Rule (generous window)",
            defaults={
                "risk_category": FoodSafetyRule.RiskCategory.MEDIUM,
                "max_hold_minutes_danger_zone": 999999,
                "max_hold_minutes_cold": 999999,
                "max_hold_minutes_hot": 999999,
            },
        )

        kitchen_staff = User.objects.filter(role="KITCHEN_STAFF").first()

        # surplus_kg is a computed property, not a DB field — filter in Python
        all_logs = MealConsumptionLog.objects.order_by("-date")[:50]
        recent_logs = [log for log in all_logs if log.surplus_kg and log.surplus_kg > 0][:5]

        if not recent_logs:
            self.stdout.write(self.style.ERROR("No consumption logs with surplus_kg > 0 found."))
            return

        created = 0
        for log in recent_logs:
            already_linked = SurplusFood.objects.filter(
                meal=log, status=SurplusFood.Status.AVAILABLE
            ).exists()
            if already_linked:
                continue

            SurplusFood.objects.create(
                meal=log,
                food_name=log.item.name,
                safety_rule=demo_rule,
                quantity=log.surplus_kg,
                unit=SurplusFood.Unit.KG,
                prepared_at=timezone.now() - timedelta(minutes=random.randint(20, 90)),
                storage_location="Central Kitchen Cold Store",
                is_refrigerated=True,
                created_by=kitchen_staff,
                status=SurplusFood.Status.AVAILABLE,
            )
            created += 1

        self.stdout.write(self.style.SUCCESS(f"Done. {created} live unclaimed surplus items created."))