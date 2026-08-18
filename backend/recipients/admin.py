from django.contrib import admin

from .models import Recipient


@admin.register(Recipient)
class RecipientAdmin(admin.ModelAdmin):
    list_display = ("organization_name_display", "contact_person", "capacity_quantity",
                     "capacity_unit", "is_active", "is_verified_display", "created_at")
    list_filter = ("is_active", "capacity_unit")
    search_fields = ("contact_person", "address", "user__organization_name", "user__username")
    readonly_fields = ("id", "created_at", "updated_at")

    def organization_name_display(self, obj):
        return obj.organization_name
    organization_name_display.short_description = "Organization"

    def is_verified_display(self, obj):
        return obj.is_verified
    is_verified_display.boolean = True
    is_verified_display.short_description = "Verified?"