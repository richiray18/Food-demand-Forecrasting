# backend/surplus/apps.py
from django.apps import AppConfig


class SurplusConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "surplus"
    verbose_name = "Surplus Food Management"
