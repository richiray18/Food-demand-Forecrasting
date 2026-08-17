# backend/pickups/urls.py
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import PickupMatchLogViewSet, PickupViewSet

router = DefaultRouter()
router.register(r"pickups", PickupViewSet, basename="pickup")
router.register(r"match-logs", PickupMatchLogViewSet, basename="pickup-match-log")

urlpatterns = [
    path("", include(router.urls)),
]
