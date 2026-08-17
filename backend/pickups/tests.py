# backend/pickups/tests.py
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from surplus.models import FoodSafetyRule, SurplusFood

from .models import Pickup

User = get_user_model()

try:
    from recipients.models import Recipient
    RECIPIENTS_AVAILABLE = True
except Exception:
    RECIPIENTS_AVAILABLE = False


class PickupTests(TestCase):
    def setUp(self):
        self.rule = FoodSafetyRule.objects.create(
            name="Cooked Curry", max_hold_minutes_danger_zone=240,
            max_hold_minutes_cold=1440, max_hold_minutes_hot=240,
        )
        self.staff = User.objects.create_user(username="staff", password="pass1234")
        self.surplus = SurplusFood.objects.create(
            food_name="Chole", safety_rule=self.rule, quantity=20,
            unit=SurplusFood.Unit.KG, prepared_at=timezone.now(), created_by=self.staff,
        )
        self.recipient = Recipient.objects.create(name="City Shelter", is_verified=True, is_active=True) \
            if RECIPIENTS_AVAILABLE else None

    def test_pickup_quantity_cannot_exceed_available(self):
        if not RECIPIENTS_AVAILABLE:
            self.skipTest("recipients app model not available in this environment.")
        with self.assertRaises(Exception):
            Pickup.objects.create(
                surplus_food=self.surplus, recipient=self.recipient,
                quantity_requested=100, scheduled_time=timezone.now() + timedelta(hours=1),
            )

    def test_confirm_pickup_reduces_remaining_quantity(self):
        if not RECIPIENTS_AVAILABLE:
            self.skipTest("recipients app model not available in this environment.")
        pickup = Pickup.objects.create(
            surplus_food=self.surplus, recipient=self.recipient,
            quantity_requested=5, scheduled_time=timezone.now() + timedelta(minutes=30),
        )
        success = pickup.confirm_pickup(quantity_collected=5, handled_by=self.staff)
        self.surplus.refresh_from_db()
        self.assertTrue(success)
        self.assertEqual(self.surplus.quantity_remaining, 15)

    def test_confirm_pickup_rejects_unsafe_food(self):
        if not RECIPIENTS_AVAILABLE:
            self.skipTest("recipients app model not available in this environment.")
        expired_surplus = SurplusFood.objects.create(
            food_name="Old Rice", safety_rule=self.rule, quantity=10,
            unit=SurplusFood.Unit.KG, prepared_at=timezone.now() - timedelta(hours=6), created_by=self.staff,
        )
        pickup = Pickup.objects.create(
            surplus_food=expired_surplus, recipient=self.recipient,
            quantity_requested=5, scheduled_time=timezone.now(),
        )
        success = pickup.confirm_pickup(handled_by=self.staff)
        self.assertFalse(success)
        self.assertEqual(pickup.status, Pickup.Status.REJECTED_UNSAFE)
