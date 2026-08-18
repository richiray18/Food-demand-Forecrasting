from rest_framework import serializers

from .models import ImpactRecord


class ImpactRecordSerializer(serializers.ModelSerializer):
    recipient_name = serializers.CharField(source="recipient.organization_name", read_only=True)
    food_name = serializers.CharField(source="pickup.surplus_food.food_name", read_only=True)

    class Meta:
        model = ImpactRecord
        fields = (
            "id", "pickup", "recipient", "recipient_name", "food_name",
            "food_saved_kg", "cost_saved", "co2e_saved_kg",
            "created_at", "updated_at",
        )
        read_only_fields = fields


class ImpactSummarySerializer(serializers.Serializer):
    """Not a ModelSerializer — this shapes the aggregated impact-page summary,
    not a single model instance."""
    food_rescued_kg = serializers.DecimalField(max_digits=12, decimal_places=2)
    pickups_completed = serializers.IntegerField()
    recipient_count = serializers.IntegerField()
    estimated_savings = serializers.DecimalField(max_digits=12, decimal_places=2)