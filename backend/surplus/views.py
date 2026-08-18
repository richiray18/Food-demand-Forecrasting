# backend/surplus/views.py
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from .models import FoodSafetyRule, SurplusFood, TemperatureLog
from .serializers import (
    FoodSafetyRuleSerializer,
    SurplusFoodListSerializer,
    SurplusFoodSerializer,
    TemperatureLogSerializer,
)


class FoodSafetyRuleViewSet(viewsets.ModelViewSet):
    queryset = FoodSafetyRule.objects.all()
    serializer_class = FoodSafetyRuleSerializer
    permission_classes = [IsAuthenticated]


class SurplusFoodViewSet(viewsets.ModelViewSet):
    queryset = SurplusFood.objects.select_related("safety_rule", "meal", "created_by").all()
    permission_classes = [IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "unit", "is_refrigerated", "is_hot_held"]
    search_fields = ["food_name", "storage_location"]
    ordering_fields = ["safe_until", "created_at", "quantity_remaining"]
    ordering = ["safe_until"]

    def get_serializer_class(self):
        if self.action == "list" and self.request.query_params.get("view") == "public":
            return SurplusFoodListSerializer
        return SurplusFoodSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        for item in qs:
            item.mark_expired_if_needed()
        if self.request.query_params.get("available_only") == "true":
            qs = qs.filter(status=SurplusFood.Status.AVAILABLE, safe_until__gt=timezone.now())
        return qs

    @action(detail=True, methods=["post"])
    def log_temperature(self, request, pk=None):
        surplus = self.get_object()
        temperature = request.data.get("temperature_c")
        if temperature is None:
            return Response({"detail": "temperature_c is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            temperature = float(temperature)
        except ValueError:
            return Response({"detail": "temperature_c must be numeric."}, status=status.HTTP_400_BAD_REQUEST)

        log = surplus.record_temperature(
            temperature, recorded_by=request.user if request.user.is_authenticated else None
        )
        return Response(
            {
                "log": TemperatureLogSerializer(log).data,
                "is_safe": surplus.is_safe,
                "status": surplus.status,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def discard(self, request, pk=None):
        surplus = self.get_object()
        surplus.status = SurplusFood.Status.DISCARDED
        surplus.discarded_reason = request.data.get("reason", "Manually discarded.")
        surplus.save()
        return Response(SurplusFoodSerializer(surplus).data)

    @action(detail=False, methods=["get"])
    def available(self, request):
        qs = self.get_queryset().filter(status=SurplusFood.Status.AVAILABLE, safe_until__gt=timezone.now())
        page = self.paginate_queryset(qs)
        serializer = SurplusFoodListSerializer(page or qs, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)


class TemperatureLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = TemperatureLog.objects.select_related("surplus_food", "recorded_by").all()
    serializer_class = TemperatureLogSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["surplus_food"]
