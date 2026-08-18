from django.contrib import admin

from .models import ImpactRecord


@admin.register(ImpactRecord)
class ImpactRecordAdmin(admin.ModelAdmin):
    list_display = ("pickup", "recipient", "food_saved_kg", "cost_saved",
                     "co2e_saved_kg", "created_at")
    list_filter = ("created_at",)
    search_fields = ("recipient__user__organization_name",)
    readonly_fields = ("pickup", "recipient", "food_saved_kg", "cost_saved",
                        "co2e_saved_kg", "created_at", "updated_at")

    def has_add_permission(self, request):
        # Records are created automatically via Pickup.confirm_pickup()
        return False