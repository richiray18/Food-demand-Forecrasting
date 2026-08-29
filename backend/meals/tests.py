from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from accounts.models import User
from meals.models import MealSession, MenuItem, MealConsumptionLog


class MealConsumptionLogSummaryTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="password123")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.session = MealSession.objects.create(name="LUNCH", start_time="12:00:00", end_time="14:00:00")
        self.item = MenuItem.objects.create(name="Rice", category="MAIN", cost_per_kg=50.00)

    def test_summary_view_with_today_logs(self):
        today = timezone.localdate()
        MealConsumptionLog.objects.create(
            date=today,
            session=self.session,
            item=self.item,
            quantity_prepared_kg=50.0,
            quantity_consumed_kg=35.0,
            headcount=100
        )

        response = self.client.get("/api/v1/meals/consumption-logs/summary/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["prepared_today"], 50.0)
        self.assertEqual(response.data["surplus_generated"], 15.0)
        self.assertEqual(response.data["headcount_served"], 100)

    def test_summary_view_empty_logs(self):
        response = self.client.get("/api/v1/meals/consumption-logs/summary/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["prepared_today"], 0.0)
        self.assertEqual(response.data["surplus_generated"], 0.0)
        self.assertEqual(response.data["headcount_served"], 0)
