# backend/surplus/urls.py
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import FoodSafetyRuleViewSet, SurplusFoodViewSet, TemperatureLogViewSet

router = DefaultRouter()
router.register(r"safety-rules", FoodSafetyRuleViewSet, basename="safety-rule")
router.register(r"surplus-food", SurplusFoodViewSet, basename="surplus-food")
router.register(r"temperature-logs", TemperatureLogViewSet, basename="temperature-log")

urlpatterns = [
    path("", include(router.urls)),
]
