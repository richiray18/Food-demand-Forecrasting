# backend/pickups/admin.py
from django.contrib import admin

from .models import Pickup, PickupMatchLog


@admin.register(Pickup)
class PickupAdmin(admin.ModelAdmin):
    list_display = ("id", "surplus_food", "recipient", "status", "quantity_requested",
                     "quantity_collected", "scheduled_time", "actual_pickup_time", "safety_check_passed")
    list_filter = ("status", "safety_check_passed", "scheduled_time")
    search_fields = ("surplus_food__food_name", "recipient__name", "verification_code")
    readonly_fields = ("id", "verification_code", "created_at", "updated_at")
    actions = ["cancel_selected"]

    def cancel_selected(self, request, queryset):
        for pickup in queryset:
            pickup.cancel(reason="Cancelled in bulk via admin.")
        self.message_user(request, f"{queryset.count()} pickup(s) cancelled.")
    cancel_selected.short_description = "Cancel selected pickups"


@admin.register(PickupMatchLog)
class PickupMatchLogAdmin(admin.ModelAdmin):
    list_display = ("surplus_food", "recipient", "score", "was_selected", "matched_at")
    list_filter = ("was_selected", "matched_at")
    search_fields = ("surplus_food__food_name", "recipient__name")
