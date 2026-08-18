from rest_framework import serializers
from .models import Campus, AcademicCalendarEntry, SystemConfig


class CampusSerializer(serializers.ModelSerializer):
    class Meta:
        model = Campus
        fields = ["id", "name", "location", "is_active"]


class AcademicCalendarEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicCalendarEntry
        fields = ["id", "date", "is_holiday", "is_exam_period", "note"]


class SystemConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemConfig
        fields = [
            "id", "max_storage_hours",
            "min_storage_temp_celsius", "max_storage_temp_celsius",
        ]