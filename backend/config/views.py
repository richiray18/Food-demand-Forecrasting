from rest_framework import viewsets, permissions
from .models import Campus, AcademicCalendarEntry, SystemConfig
from .serializers import CampusSerializer, AcademicCalendarEntrySerializer, SystemConfigSerializer
from django.shortcuts import render


class CampusViewSet(viewsets.ModelViewSet):
    queryset = Campus.objects.all()
    serializer_class = CampusSerializer
    permission_classes = [permissions.IsAuthenticated]


class AcademicCalendarEntryViewSet(viewsets.ModelViewSet):
    queryset = AcademicCalendarEntry.objects.all()
    serializer_class = AcademicCalendarEntrySerializer
    permission_classes = [permissions.IsAuthenticated]
    filterset_fields = ["date", "is_holiday", "is_exam_period"]


class SystemConfigViewSet(viewsets.ModelViewSet):
    """
    Single-row config — should only ever be one SystemConfig object,
    but ModelViewSet keeps this simple and consistent with the rest.
    """
    queryset = SystemConfig.objects.all()
    serializer_class = SystemConfigSerializer
    permission_classes = [permissions.IsAuthenticated]
# Frontend HTML Template Views

def login_view(request):
    return render(request, "accounts/login.html")


def dashboard_view(request):
    return render(request, "dashboard/dashboard.html")


def forecast_view(request):
    return render(request, "forecast/forecast.html")


def preparation_view(request):
    return render(request, "preparation/preparation.html")


def surplus_view(request):
    return render(request, "surplus/surplus.html")


def recipients_view(request):
    return render(request, "recipients/recipients.html")


def pickups_view(request):
    return render(request, "pickups/pickups.html")


def impact_view(request):
    return render(request, "impact/impact.html")