from django.contrib import admin
from .models import MealSession, MenuItem, MealConsumptionLog


@admin.register(MealSession)
class MealSessionAdmin(admin.ModelAdmin):
    list_display = ["name", "start_time", "end_time"]


@admin.register(MenuItem)
class MenuItemAdmin(admin.ModelAdmin):
    list_display = ["name", "category", "cost_per_kg", "carbon_factor_kg_co2e_per_kg"]
    list_filter = ["category"]
    search_fields = ["name"]


@admin.register(MealConsumptionLog)
class MealConsumptionLogAdmin(admin.ModelAdmin):
    list_display = [
        "date", "session", "item", "quantity_prepared_kg",
        "quantity_consumed_kg", "surplus_kg", "headcount",
        "is_holiday", "is_exam_period",
    ]
    list_filter = ["session", "is_holiday", "is_exam_period", "date"]
    date_hierarchy = "date"
    search_fields = ["item__name"]