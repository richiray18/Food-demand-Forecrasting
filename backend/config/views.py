from rest_framework import viewsets, permissions
from .models import Campus, AcademicCalendarEntry, SystemConfig
from .serializers import CampusSerializer, AcademicCalendarEntrySerializer, SystemConfigSerializer


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