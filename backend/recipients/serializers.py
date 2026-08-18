from rest_framework import serializers

from .models import Recipient


class RecipientSerializer(serializers.ModelSerializer):
    organization_name = serializers.CharField(source="user.organization_name", read_only=True)
    phone_number = serializers.CharField(source="user.phone_number", read_only=True)
    is_verified = serializers.BooleanField(read_only=True)
    is_available_for_matching = serializers.BooleanField(read_only=True)

    class Meta:
        model = Recipient
        fields = (
            "id", "user", "organization_name", "phone_number",
            "contact_person", "address", "capacity_quantity", "capacity_unit",
            "is_active", "is_verified", "is_available_for_matching",
            "created_at", "updated_at",
        )
        read_only_fields = ("id", "user", "created_at", "updated_at")

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            validated_data["user"] = request.user
        return super().create(validated_data)


class RecipientListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for matching-facing recipient listings."""
    organization_name = serializers.CharField(source="user.organization_name", read_only=True)
    is_verified = serializers.BooleanField(read_only=True)

    class Meta:
        model = Recipient
        fields = ("id", "organization_name", "capacity_quantity", "capacity_unit",
                   "is_active", "is_verified")