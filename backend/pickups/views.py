# backend/pickups/views.py
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Pickup, PickupMatchLog
from .serializers import (
    PickupConfirmSerializer,
    PickupMatchLogSerializer,
    PickupRejectSerializer,
    PickupSerializer,
)


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


class PickupMatchLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = PickupMatchLog.objects.select_related("surplus_food", "recipient").all()
    serializer_class = PickupMatchLogSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["surplus_food", "recipient", "was_selected"]
