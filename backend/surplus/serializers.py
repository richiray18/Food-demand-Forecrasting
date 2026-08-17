# backend/surplus/serializers.py
from rest_framework import serializers

from .models import FoodSafetyRule, SurplusFood, TemperatureLog


class FoodSafetyRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = FoodSafetyRule
        fields = "__all__"


class TemperatureLogSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.CharField(source="recorded_by.get_full_name", read_only=True, default="")

    class Meta:
        model = TemperatureLog
        fields = ("id", "surplus_food", "temperature_c", "recorded_at", "recorded_by", "recorded_by_name")
        read_only_fields = ("recorded_at",)


class SurplusFoodSerializer(serializers.ModelSerializer):
    is_safe = serializers.BooleanField(read_only=True)
    time_remaining_minutes = serializers.SerializerMethodField()
    safety_rule_name = serializers.CharField(source="safety_rule.name", read_only=True)

    class Meta:
        model = SurplusFood
        fields = (
            "id", "meal", "food_name", "safety_rule", "safety_rule_name",
            "quantity", "unit", "quantity_remaining", "prepared_at",
            "storage_location", "current_temperature_c", "is_refrigerated",
            "is_hot_held", "status", "safe_until", "danger_zone_minutes_elapsed",
            "estimated_cost_saved", "estimated_co2e_saved_kg", "discarded_reason",
            "created_by", "created_at", "updated_at", "is_safe", "time_remaining_minutes",
        )
        read_only_fields = (
            "id", "safe_until", "danger_zone_minutes_elapsed", "status",
            "created_by", "created_at", "updated_at", "quantity_remaining",
        )

    def get_time_remaining_minutes(self, obj):
        return int(obj.time_remaining.total_seconds() // 60)

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data["created_by"] = request.user
        return super().create(validated_data)


class SurplusFoodListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for recipient-facing surplus listings."""
    is_safe = serializers.BooleanField(read_only=True)

    class Meta:
        model = SurplusFood
        fields = ("id", "food_name", "quantity_remaining", "unit", "storage_location",
                   "safe_until", "is_safe", "status")
