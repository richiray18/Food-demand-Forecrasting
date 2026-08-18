from rest_framework.routers import DefaultRouter
from .views import CampusViewSet, AcademicCalendarEntryViewSet, SystemConfigViewSet

router = DefaultRouter()
router.register("campuses", CampusViewSet)
router.register("calendar", AcademicCalendarEntryViewSet)
router.register("system-config", SystemConfigViewSet)

urlpatterns = router.urls