# backend/pickups/serializers.py
from rest_framework import serializers

from .models import Pickup, PickupMatchLog


class PickupSerializer(serializers.ModelSerializer):
    food_name = serializers.CharField(source="surplus_food.food_name", read_only=True)
    recipient_name = serializers.CharField(source="recipient.name", read_only=True)
    is_surplus_safe = serializers.SerializerMethodField()

    class Meta:
        model = Pickup
        fields = (
            "id", "surplus_food", "food_name", "recipient", "recipient_name",
            "quantity_requested", "quantity_collected", "status", "scheduled_time",
            "actual_pickup_time", "verification_code", "safety_check_passed",
            "temperature_at_pickup_c", "rejection_reason", "handled_by", "notes",
            "created_at", "updated_at", "is_surplus_safe",
        )
        read_only_fields = (
            "id", "quantity_collected", "status", "actual_pickup_time",
            "verification_code", "safety_check_passed", "temperature_at_pickup_c",
            "rejection_reason", "handled_by", "created_at", "updated_at",
        )

    def get_is_surplus_safe(self, obj):
        return obj.surplus_food.is_safe

    def validate(self, attrs):
        surplus_food = attrs.get("surplus_food") or getattr(self.instance, "surplus_food", None)
        quantity_requested = attrs.get("quantity_requested") or getattr(self.instance, "quantity_requested", None)
        scheduled_time = attrs.get("scheduled_time") or getattr(self.instance, "scheduled_time", None)

        if surplus_food and not surplus_food.is_safe:
            raise serializers.ValidationError("This surplus item is no longer safe for redistribution.")
        if surplus_food and quantity_requested and quantity_requested > surplus_food.quantity_remaining:
            raise serializers.ValidationError(
                f"Only {surplus_food.quantity_remaining}{surplus_food.unit} remaining for this item."
            )
        if scheduled_time and surplus_food and scheduled_time > surplus_food.safe_until:
            raise serializers.ValidationError("Scheduled pickup time is after the food's safe-use window.")
        return attrs


class PickupConfirmSerializer(serializers.Serializer):
    temperature_c = serializers.FloatField(required=False)
    quantity_collected = serializers.DecimalField(max_digits=8, decimal_places=2, required=False)


class PickupRejectSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255)


class PickupMatchLogSerializer(serializers.ModelSerializer):
    recipient_name = serializers.CharField(source="recipient.name", read_only=True)

    class Meta:
        model = PickupMatchLog
        fields = ("id", "surplus_food", "recipient", "recipient_name", "matched_at",
                   "score", "was_selected", "reason")
