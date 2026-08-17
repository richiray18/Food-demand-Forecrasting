# backend/surplus/admin.py
from django.contrib import admin

from .models import FoodSafetyRule, SurplusFood, TemperatureLog


@admin.register(FoodSafetyRule)
class FoodSafetyRuleAdmin(admin.ModelAdmin):
    list_display = ("name", "risk_category", "max_hold_minutes_danger_zone",
                     "max_hold_minutes_cold", "max_hold_minutes_hot")
    list_filter = ("risk_category",)
    search_fields = ("name",)


class TemperatureLogInline(admin.TabularInline):
    model = TemperatureLog
    extra = 0
    readonly_fields = ("recorded_at",)


@admin.register(SurplusFood)
class SurplusFoodAdmin(admin.ModelAdmin):
    list_display = ("food_name", "quantity", "unit", "quantity_remaining", "status",
                     "safe_until", "is_safe_display", "storage_location", "created_at")
    list_filter = ("status", "unit", "is_refrigerated", "is_hot_held", "safety_rule")
    search_fields = ("food_name", "storage_location")
    readonly_fields = ("id", "safe_until", "danger_zone_minutes_elapsed", "created_at", "updated_at")
    inlines = [TemperatureLogInline]
    actions = ["mark_as_expired", "mark_as_discarded"]

    def is_safe_display(self, obj):
        return obj.is_safe
    is_safe_display.boolean = True
    is_safe_display.short_description = "Safe?"

    def mark_as_expired(self, request, queryset):
        for obj in queryset:
            obj.status = SurplusFood.Status.EXPIRED
            obj.save()
        self.message_user(request, f"{queryset.count()} item(s) marked expired.")
    mark_as_expired.short_description = "Mark selected as expired"

    def mark_as_discarded(self, request, queryset):
        queryset.update(status=SurplusFood.Status.DISCARDED)
        self.message_user(request, f"{queryset.count()} item(s) marked discarded.")
    mark_as_discarded.short_description = "Mark selected as discarded"


@admin.register(TemperatureLog)
class TemperatureLogAdmin(admin.ModelAdmin):
    list_display = ("surplus_food", "temperature_c", "recorded_at", "recorded_by")
    list_filter = ("recorded_at",)
