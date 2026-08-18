from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ["username", "email", "role", "is_verified", "is_staff"]
    list_filter = ["role", "is_verified", "is_staff"]
    fieldsets = UserAdmin.fieldsets + (
        ("Role & Org Info", {"fields": ("role", "phone_number", "organization_name", "is_verified")}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ("Role & Org Info", {"fields": ("role", "phone_number", "organization_name", "is_verified")}),
    )