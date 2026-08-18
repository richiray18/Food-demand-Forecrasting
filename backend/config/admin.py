from django.contrib import admin
from .models import Campus, AcademicCalendarEntry, SystemConfig


@admin.register(Campus)
class CampusAdmin(admin.ModelAdmin):
    list_display = ["name", "location", "is_active"]
    list_filter = ["is_active"]
    search_fields = ["name"]


@admin.register(AcademicCalendarEntry)
class AcademicCalendarEntryAdmin(admin.ModelAdmin):
    list_display = ["date", "is_holiday", "is_exam_period", "note"]
    list_filter = ["is_holiday", "is_exam_period"]
    date_hierarchy = "date"


@admin.register(SystemConfig)
class SystemConfigAdmin(admin.ModelAdmin):
    list_display = ["max_storage_hours", "min_storage_temp_celsius", "max_storage_temp_celsius"]

    def has_add_permission(self, request):
        # Only one row should ever exist — block adding more from admin too
        return not SystemConfig.objects.exists()