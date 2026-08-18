from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ImpactRecordViewSet, ImpactSummaryView

router = DefaultRouter()
router.register(r"records", ImpactRecordViewSet, basename="impact-record")

urlpatterns = [
    path("summary/", ImpactSummaryView.as_view(), name="impact-summary"),
    path("", include(router.urls)),
]