# backend/pickups/views.py
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from surplus.models import SurplusFood

from .models import Pickup, PickupMatchLog
from .serializers import (
    PickupConfirmSerializer,
    PickupMatchLogSerializer,
    PickupRejectSerializer,
    PickupSerializer,
)

try:
    from recipients.models import Recipient
except Exception:
    Recipient = None


class PickupViewSet(viewsets.ModelViewSet):
    queryset = Pickup.objects.select_related("surplus_food", "recipient", "handled_by").all()
    serializer_class = PickupSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["status", "recipient", "surplus_food"]
    ordering_fields = ["scheduled_time", "created_at"]
    ordering = ["-scheduled_time"]

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None):
        pickup = self.get_object()
        serializer = PickupConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        success = pickup.confirm_pickup(
            temperature_c=serializer.validated_data.get("temperature_c"),
            quantity_collected=serializer.validated_data.get("quantity_collected"),
            handled_by=request.user,
        )
        pickup.refresh_from_db()
        return Response(
            PickupSerializer(pickup).data,
            status=status.HTTP_200_OK if success else status.HTTP_409_CONFLICT,
        )

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        pickup = self.get_object()
        serializer = PickupRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        pickup.reject(reason=serializer.validated_data["reason"], handled_by=request.user)
        return Response(PickupSerializer(pickup).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        pickup = self.get_object()
        pickup.cancel(reason=request.data.get("reason", ""))
        return Response(PickupSerializer(pickup).data)

    @action(detail=False, methods=["get"], url_path="match/(?P<surplus_id>[^/.]+)")
    def match(self, request, surplus_id=None):
        """
        Ranks eligible, verified recipients for a given surplus item using
        capacity fit, urgency (time left before it's unsafe) and dietary compatibility.
        """
        try:
            surplus = SurplusFood.objects.get(pk=surplus_id)
        except SurplusFood.DoesNotExist:
            return Response({"detail": "Surplus item not found."}, status=status.HTTP_404_NOT_FOUND)

        if not surplus.is_safe:
            return Response(
                {"detail": "Surplus item is no longer safe to redistribute."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if Recipient is None:
            return Response({"detail": "Recipients app is not available."}, status=status.HTTP_501_NOT_IMPLEMENTED)

        candidates = Recipient.objects.filter(is_verified=True, is_active=True)
        results = []
        for recipient in candidates:
            score, reason = self._score_recipient(surplus, recipient)
            if score is None:
                continue
            PickupMatchLog.objects.create(surplus_food=surplus, recipient=recipient, score=score, reason=reason)
            results.append({
                "recipient_id": recipient.id,
                "recipient_name": getattr(recipient, "name", str(recipient)),
                "score": round(score, 2),
                "reason": reason,
            })

        results.sort(key=lambda r: r["score"], reverse=True)
        return Response({"surplus_food": surplus.food_name, "matches": results[:10]})

    @staticmethod
    def _score_recipient(surplus, recipient):
        capacity = getattr(recipient, "daily_capacity_kg", None)
        if capacity is not None and capacity <= 0:
            return None, "No remaining capacity."

        score = 50.0
        reason_parts = []

        if capacity:
            fit_ratio = min(float(surplus.quantity_remaining) / float(capacity), 1.0)
            score += fit_ratio * 20
            reason_parts.append(f"capacity fit {fit_ratio:.0%}")

        minutes_left = surplus.time_remaining.total_seconds() / 60
        urgency_score = max(0.0, 30 - (minutes_left / 10))
        score += urgency_score
        reason_parts.append(f"{int(minutes_left)} min remaining")

        if getattr(recipient, "dietary_restrictions", None):
            reason_parts.append("dietary profile checked")

        return score, "; ".join(reason_parts)


class PickupMatchLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = PickupMatchLog.objects.select_related("surplus_food", "recipient").all()
    serializer_class = PickupMatchLogSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["surplus_food", "recipient", "was_selected"]
