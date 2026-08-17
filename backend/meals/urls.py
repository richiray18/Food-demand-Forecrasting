from rest_framework.routers import DefaultRouter
from .views import MealSessionViewSet, MenuItemViewSet, MealConsumptionLogViewSet

router = DefaultRouter()
router.register("sessions", MealSessionViewSet)
router.register("items", MenuItemViewSet)
router.register("consumption-logs", MealConsumptionLogViewSet)

urlpatterns = router.urls