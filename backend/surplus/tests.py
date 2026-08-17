# backend/surplus/tests.py
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from .models import FoodSafetyRule, SurplusFood

User = get_user_model()


class SurplusFoodSafetyTests(TestCase):
    def setUp(self):
        self.rule = FoodSafetyRule.objects.create(
            name="Cooked Rice/Gravy",
            risk_category=FoodSafetyRule.RiskCategory.HIGH,
            max_hold_minutes_danger_zone=240,
            max_hold_minutes_cold=1440,
            max_hold_minutes_hot=240,
        )
        self.user = User.objects.create_user(username="chef", password="pass1234")

    def test_safe_until_calculated_on_save(self):
        prepared = timezone.now()
        surplus = SurplusFood.objects.create(
            food_name="Veg Pulao", safety_rule=self.rule, quantity=10,
            unit=SurplusFood.Unit.KG, prepared_at=prepared, created_by=self.user,
        )
        expected = prepared + timedelta(minutes=240)
        self.assertAlmostEqual(surplus.safe_until.timestamp(), expected.timestamp(), delta=2)
        self.assertTrue(surplus.is_safe)

    def test_expired_food_marked_unsafe(self):
        prepared = timezone.now() - timedelta(hours=5)
        surplus = SurplusFood.objects.create(
            food_name="Dal", safety_rule=self.rule, quantity=5,
            unit=SurplusFood.Unit.KG, prepared_at=prepared, created_by=self.user,
        )
        self.assertFalse(surplus.is_safe)
        surplus.mark_expired_if_needed()
        self.assertEqual(surplus.status, SurplusFood.Status.EXPIRED)

    def test_refrigerated_extends_safe_window(self):
        prepared = timezone.now() - timedelta(hours=5)
        surplus = SurplusFood.objects.create(
            food_name="Paneer Curry", safety_rule=self.rule, quantity=5,
            unit=SurplusFood.Unit.KG, prepared_at=prepared,
            is_refrigerated=True, created_by=self.user,
        )
        self.assertTrue(surplus.is_safe)

    def test_quantity_remaining_defaults_to_quantity(self):
        surplus = SurplusFood.objects.create(
            food_name="Bread", safety_rule=self.rule, quantity=8,
            unit=SurplusFood.Unit.KG, prepared_at=timezone.now(), created_by=self.user,
        )
        self.assertEqual(surplus.quantity_remaining, surplus.quantity)
