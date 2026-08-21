from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import User
from recipients.models import Recipient
from surplus.models import FoodSafetyRule, SurplusFood


class Command(BaseCommand):
    help = "Create NutriFlow demo users and sample data"

    def handle(self, *args, **options):

        # ---------------------------------------------------------
        # 1. DEMO USERS
        # ---------------------------------------------------------
        users_data = [
            {
                "username": "admin",
                "password": "admin123",
                "role": User.Role.ADMIN,
                "organization_name": "Campus Dining Administration",
                "is_verified": True,
                "is_staff": True,
                "is_superuser": True,
            },
            {
                "username": "kitchen_staff",
                "password": "staff123",
                "role": User.Role.KITCHEN_STAFF,
                "organization_name": "Central Kitchen Operations",
                "is_verified": True,
                "is_staff": False,
                "is_superuser": False,
            },
            {
                "username": "test1",
                "password": "password123",
                "role": User.Role.KITCHEN_STAFF,
                "organization_name": "Kitchen Staff User",
                "is_verified": True,
                "is_staff": False,
                "is_superuser": False,
            },
            {
                "username": "test2",
                "password": "password123",
                "role": User.Role.WARDEN,
                "organization_name": "Hostel Administration",
                "is_verified": True,
                "is_staff": False,
                "is_superuser": False,
            },
            {
                "username": "test3",
                "password": "password123",
                "role": User.Role.RECIPIENT_ORG,
                "organization_name": "City Food Bank",
                "is_verified": True,
                "is_staff": False,
                "is_superuser": False,
            },
            {
                "username": "ngo_shelter",
                "password": "password123",
                "role": User.Role.RECIPIENT_ORG,
                "organization_name": "Hope Care Shelter NGO",
                "is_verified": True,
                "is_staff": False,
                "is_superuser": False,
            },
            {
                "username": "ngo_robinhood",
                "password": "password123",
                "role": User.Role.RECIPIENT_ORG,
                "organization_name": "Robin Hood Army Campus Chapter",
                "is_verified": True,
                "is_staff": False,
                "is_superuser": False,
            },
        ]

        created_users = {}

        for data in users_data:
            username = data["username"]

            user, created = User.objects.get_or_create(
                username=username
            )

            user.role = data["role"]
            user.organization_name = data["organization_name"]
            user.is_verified = data["is_verified"]
            user.is_active = True
            user.is_staff = data["is_staff"]
            user.is_superuser = data["is_superuser"]

            user.set_password(data["password"])
            user.save()

            created_users[username] = user

            action = "Created" if created else "Updated"

            self.stdout.write(
                self.style.SUCCESS(
                    f"{action} demo user: {username}"
                )
            )

        # ---------------------------------------------------------
        # 2. HACCP FOOD SAFETY RULES
        # ---------------------------------------------------------
        rules = [
            {
                "name": "High Risk TCS Food (Cooked Rice, Dal, Gravies, Dairy)",
                "risk_category": FoodSafetyRule.RiskCategory.HIGH,
                "danger_zone": 240,
                "cold": 1440,
                "hot": 240,
            },
            {
                "name": "Medium Risk (Cooked Breads, Dry Sabzi)",
                "risk_category": FoodSafetyRule.RiskCategory.MEDIUM,
                "danger_zone": 360,
                "cold": 2880,
                "hot": 360,
            },
            {
                "name": "Low Risk (Dry / Shelf-Stable / Packaged Goods)",
                "risk_category": FoodSafetyRule.RiskCategory.LOW,
                "danger_zone": 1440,
                "cold": 4320,
                "hot": 1440,
            },
        ]

        safety_rules = {}

        for data in rules:
            rule, created = FoodSafetyRule.objects.get_or_create(
                name=data["name"],
                defaults={
                    "risk_category": data["risk_category"],
                    "max_hold_minutes_danger_zone": data["danger_zone"],
                    "max_hold_minutes_cold": data["cold"],
                    "max_hold_minutes_hot": data["hot"],
                    "danger_zone_min_c": Decimal("5.0"),
                    "danger_zone_max_c": Decimal("60.0"),
                },
            )

            safety_rules[data["risk_category"]] = rule

        self.stdout.write(
            self.style.SUCCESS("HACCP safety rules ready.")
        )

        # ---------------------------------------------------------
        # 3. RECIPIENT ORGANIZATIONS
        # ---------------------------------------------------------
        recipients_data = [
            (
                "test3",
                Decimal("50.0"),
                "Sector 4 Community Welfare Hub",
                "City Food Bank",
            ),
            (
                "ngo_shelter",
                Decimal("35.0"),
                "North Campus Care Shelter",
                "Hope Care Shelter",
            ),
            (
                "ngo_robinhood",
                Decimal("80.0"),
                "City Volunteer Redistribution Center",
                "Robin Hood Army",
            ),
        ]

        for username, capacity, address, contact in recipients_data:

            user = created_users[username]

            Recipient.objects.get_or_create(
                user=user,
                defaults={
                    "capacity_quantity": capacity,
                    "capacity_unit": Recipient.Unit.KG,
                    "is_active": True,
                    "address": address,
                    "contact_person": contact,
                },
            )

        self.stdout.write(
            self.style.SUCCESS("Recipient organizations ready.")
        )

        # ---------------------------------------------------------
        # 4. SAMPLE SURPLUS FOOD
        # ---------------------------------------------------------
        staff_user = created_users["kitchen_staff"]

        rule_high = safety_rules[FoodSafetyRule.RiskCategory.HIGH]

        prepared_at = timezone.now() - timedelta(minutes=45)

        surplus, created = SurplusFood.objects.get_or_create(
            food_name="Paneer Butter Masala & Steamed Rice",
            defaults={
                "safety_rule": rule_high,
                "quantity": Decimal("18.50"),
                "quantity_remaining": Decimal("18.50"),
                "unit": SurplusFood.Unit.KG,
                "prepared_at": prepared_at,
                "storage_location": "Dining Hall 1 - Hot Holding Counter",
                "current_temperature_c": Decimal("63.5"),
                "is_hot_held": True,
                "is_refrigerated": False,
                "status": SurplusFood.Status.AVAILABLE,
                "created_by": staff_user,
            },
        )

        if created:
            self.stdout.write(
                self.style.SUCCESS("Sample surplus food created.")
            )
        else:
            self.stdout.write(
                self.style.SUCCESS("Sample surplus food already exists.")
            )

        # ---------------------------------------------------------
        # DONE
        # ---------------------------------------------------------
        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                "============================================"
            )
        )
        self.stdout.write(
            self.style.SUCCESS(
                "NutriFlow demo data is ready!"
            )
        )
        self.stdout.write(
            self.style.SUCCESS(
                "Admin login: admin / admin123"
            )
        )
        self.stdout.write(
            self.style.SUCCESS(
                "Kitchen login: kitchen_staff / staff123"
            )
        )
        self.stdout.write(
            self.style.SUCCESS(
                "============================================"
            )
        )