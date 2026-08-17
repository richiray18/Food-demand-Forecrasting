from rest_framework import viewsets, permissions
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