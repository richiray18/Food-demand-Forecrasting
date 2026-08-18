from rest_framework import serializers
from .models import MealSession, MenuItem, MealConsumptionLog


class MealSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = MealSession
        fields = ["id", "name", "start_time", "end_time"]


class MenuItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = MenuItem
        fields = ["id", "name", "category", "cost_per_kg", "carbon_factor_kg_co2e_per_kg"]


class MealConsumptionLogSerializer(serializers.ModelSerializer):
    surplus_kg = serializers.ReadOnlyField()  # exposes the @property from the model
    session_name = serializers.CharField(source="session.name", read_only=True)
    item_name = serializers.CharField(source="item.name", read_only=True)

    class Meta:
        model = MealConsumptionLog
        fields = [
            "id", "date", "session", "session_name", "item", "item_name",
            "quantity_prepared_kg", "quantity_consumed_kg", "surplus_kg",
            "headcount", "is_holiday", "is_exam_period", "weather_note",
            "created_at",
        ]