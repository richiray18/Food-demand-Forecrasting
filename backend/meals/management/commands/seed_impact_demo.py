import random
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import User
from meals.models import MealConsumptionLog
from surplus.models import FoodSafetyRule, SurplusFood
from pickups.models import Pickup
from recipients.models import Recipient
from impact.models import ImpactRecord


class Command(BaseCommand):
    help = "Seeds a realistic surplus -> pickup -> impact chain for demo purposes"

    def handle(self, *args, **options):
        if ImpactRecord.objects.count() >= 15:
            self.stdout.write("Impact data already seeded, skipping.")
            return

        demo_rule, _ = FoodSafetyRule.objects.get_or_create(
            name="Demo Seed Rule (generous window)",
            defaults={
                "risk_category": FoodSafetyRule.RiskCategory.MEDIUM,
                "max_hold_minutes_danger_zone": 999999,
                "max_hold_minutes_cold": 999999,
                "max_hold_minutes_hot": 999999,
            },
        )

        recipients = []
        for username, org, capacity in [
            ("ngo_robinhood", "Robinhood Foundation", 60),
            ("ngo_shelter", "Community Shelter Network", 40),
        ]:
            try:
                user = User.objects.get(username=username)
            except User.DoesNotExist:
                self.stdout.write(f"  skip: no user '{username}' found")
                continue
            recipient, created = Recipient.objects.get_or_create(
                user=user,
                defaults={
                    "capacity_quantity": capacity,
                    "capacity_unit": Recipient.Unit.KG,
                    "is_active": True,
                    "address": f"{org} campus dropoff point",
                    "contact_person": org,
                },
            )
            recipients.append(recipient)
            self.stdout.write(f"  {'created' if created else 'exists'}: Recipient for {username}")

        if not recipients:
            self.stdout.write(self.style.ERROR("No recipients available — aborting."))
            return

        kitchen_staff = User.objects.filter(role="KITCHEN_STAFF").first()

        logs_with_surplus = [
            log for log in MealConsumptionLog.objects.all()
            if log.surplus_kg and log.surplus_kg > 0
        ][:20]

        if not logs_with_surplus:
            self.stdout.write(self.style.ERROR("No MealConsumptionLog rows with surplus_kg > 0 — run seed_meals first."))
            return

        created_count = 0
        for i, log in enumerate(logs_with_surplus):
            days_ago = 14 - int((i / len(logs_with_surplus)) * 14)
            backdated_time = timezone.now() - timedelta(days=days_ago, hours=random.randint(0, 5))

            surplus = SurplusFood.objects.create(
                meal=log,
                food_name=log.item.name,
                safety_rule=demo_rule,
                quantity=log.surplus_kg,
                unit=SurplusFood.Unit.KG,
                prepared_at=backdated_time,
                storage_location="Central Kitchen Cold Store",
                is_refrigerated=True,
                created_by=kitchen_staff,
            )

            recipient = recipients[i % len(recipients)]
            pickup = Pickup.objects.create(
                surplus_food=surplus,
                recipient=recipient,
                quantity_requested=surplus.quantity_remaining,
                scheduled_time=backdated_time + timedelta(hours=1),
            )

            success = pickup.confirm_pickup(handled_by=kitchen_staff)
            if not success:
                self.stdout.write(f"  pickup {i} rejected (unexpected) — check safety rule")
                continue

            Pickup.objects.filter(pk=pickup.pk).update(
                created_at=backdated_time, actual_pickup_time=backdated_time + timedelta(hours=1)
            )
            ImpactRecord.objects.filter(pickup=pickup).update(created_at=backdated_time)

            created_count += 1

        self.stdout.write(self.style.SUCCESS(f"Done. {created_count} completed pickups + impact records created."))