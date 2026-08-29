from django.db.models import Sum
from django.utils import timezone
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import MealSession, MenuItem, MealConsumptionLog
from .serializers import MealSessionSerializer, MenuItemSerializer, MealConsumptionLogSerializer


class MealSessionViewSet(viewsets.ModelViewSet):
    queryset = MealSession.objects.all()
    serializer_class = MealSessionSerializer
    permission_classes = [permissions.IsAuthenticated]


class MenuItemViewSet(viewsets.ModelViewSet):
    queryset = MenuItem.objects.all()
    serializer_class = MenuItemSerializer
    permission_classes = [permissions.IsAuthenticated]


class MealConsumptionLogViewSet(viewsets.ModelViewSet):
    queryset = MealConsumptionLog.objects.all()
    serializer_class = MealConsumptionLogSerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ["date", "session", "item"]  # lets ML dev query ?date=2026-08-01 etc.

    @action(detail=False, methods=["get"])
    def summary(self, request):
        """
        Dashboard summary view returning aggregated metrics for today's logs.
        """
        today = timezone.localdate()
        today_logs = self.get_queryset().filter(date=today)

        summary_data = today_logs.aggregate(
            total_prepared=Sum("quantity_prepared_kg"),
            total_consumed=Sum("quantity_consumed_kg"),
            total_headcount=Sum("headcount"),
        )

        total_prepared = summary_data["total_prepared"] or 0
        total_consumed = summary_data["total_consumed"] or 0
        total_headcount = summary_data["total_headcount"] or 0
        total_surplus = total_prepared - total_consumed

        return Response({
            "prepared_today": float(total_prepared),
            "surplus_generated": float(total_surplus),
            "headcount_served": int(total_headcount),
        })